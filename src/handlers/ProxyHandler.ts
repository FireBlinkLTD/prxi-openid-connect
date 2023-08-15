import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { invalidateAuthCookies, sendErrorResponse, sendJsonResponse, sendRedirect, setAuthCookies, setCookies } from "../utils/ResponseUtils";
import { parse } from 'cookie';
import { getConfig } from "../config/getConfig";
import { Mapping } from "../config/Mapping";
import { JWTVerificationResult, OpenIDUtils } from "../utils/OpenIDUtils";
import { decode, Jwt } from 'jsonwebtoken';
import getLogger from "../Logger";
import { Logger } from "pino";

export class ProxyHandler implements RequestHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('ProxyHandler')
  }

  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string,  context: Record<string, any>): boolean {
    context.mapping = this.findMatchingMapping(
      getConfig().mappings.public,
      method,
      path
    );

    if (context.mapping) {
      this.logger.child({mapping: context.mapping}).info('Handling public mapping');
      context.public = true;

      return true;
    }

    context.mapping = this.findMatchingMapping(
      getConfig().mappings.api,
      method,
      path
    );

    if (context.mapping) {
      this.logger.child({mapping: context.mapping}).info('Handling api mapping');
      context.api = true;

      return true;
    }

    context.mapping = this.findMatchingMapping(
      getConfig().mappings.pages,
      method,
      path
    );

    if (context.mapping) {
      this.logger.child({mapping: context.mapping}).info('Handling page mapping');
      context.page = true;

      return true;
    }

    return false
  }

  /**
   * @inheritdoc
   */
  async handle(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: string, path: string, context: Record<string, any>): Promise<void> {
    // skip JWT validation for public mappings
    if (context.public) {
      await proxyRequest();

      return;
    }

    let breakFlow = await this.handleAuthenticationFlow(req, res, method, path, context);
    if (breakFlow) {
      return;
    }

    breakFlow = await this.handleAuthorizationFlow(req, res, method, path, context);
    if (breakFlow) {
      return;
    }

    const proxyRequestHeaders: Record<string, string> = {};
    if (getConfig().headers.claims.all) {
      proxyRequestHeaders[getConfig().headers.claims.all] = JSON.stringify(context.claims.all);
    }

    if (getConfig().headers.claims.matching) {
      proxyRequestHeaders[getConfig().headers.claims.matching] = JSON.stringify(context.claims.matching);
    }

    await proxyRequest({
      proxyRequestHeaders,
    });
  }

  /**
   * Handle authentication flow
   * @param req
   * @param res
   * @param method
   * @param path
   * @param context
   * @returns
   */
  private async handleAuthenticationFlow(req: IncomingMessage, res: ServerResponse, method: string, path: string, context: Record<string, any>): Promise<boolean> {
    const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};

    let accessToken = context.accessToken = cookies[getConfig().cookies.names.accessToken];
    let idToken = context.idToken = cookies[getConfig().cookies.names.idToken];
    let refreshToken = context.refreshToken = cookies[getConfig().cookies.names.idToken];

    let { jwt: accessTokenJWT, verificationResult: accessTokenVerificationResult } = await this.parseTokenAndVerify(accessToken);
    let { jwt: idTokenJWT, verificationResult: idTokenVerificationResult } = await this.parseTokenAndVerify(context.idTokenJWT);
    context.idTokenJWT = idTokenJWT;

    // if access token is missing or expired attempt to refresh tokens
    if(
      accessTokenVerificationResult === JWTVerificationResult.MISSING ||
      accessTokenVerificationResult === JWTVerificationResult.EXPIRED ||
      idTokenVerificationResult === JWTVerificationResult.EXPIRED
    ) {
      let { verificationResult: refreshTokenVerificationResult } = await this.parseTokenAndVerify(accessToken);
      if (refreshTokenVerificationResult === JWTVerificationResult.SUCCESS) {
        const tokens = await OpenIDUtils.refreshTokens(refreshToken);
        setAuthCookies(res, tokens);

        accessToken = context.accessToken = tokens.access_token;
        idToken = context.idToken = tokens.id_token;
        refreshToken = context.refreshToken = tokens.refresh_token;

        const accessVerification = await this.parseTokenAndVerify(accessToken);
        const idVerification = await this.parseTokenAndVerify(idToken);
        accessTokenJWT = accessVerification.jwt;
        accessTokenVerificationResult = accessVerification.verificationResult;

        context.idTokenJWT = idVerification.jwt;
      }
    }

    if (accessTokenVerificationResult === JWTVerificationResult.MISSING) {
      if (context.page) {
        let query = '';
        let queryIdx = req.url.indexOf('?');
        if (queryIdx >= 0) {
          query = req.url.substring(queryIdx);
        }

        setCookies(res, {
          [getConfig().cookies.names.originalPath]: {
            value: path + query,
            expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          }
        });

        await sendRedirect(res, OpenIDUtils.getAuthorizationUrl());

        return true;
      }

      await sendErrorResponse(req, 401, 'Unauthorized', res);

      return true;
    }

    if (accessTokenVerificationResult !== JWTVerificationResult.SUCCESS) {
      if (context.api) {
        sendErrorResponse(req, 401, 'Unauthorized', res);

        return true;
      }

      // for page request redirect to the login page
      invalidateAuthCookies(res);
      await sendRedirect(res, OpenIDUtils.getAuthorizationUrl());
      return true;
    }

    context.accessToken = accessToken;
    context.accessTokenJWT = accessTokenJWT

    return false;
  }

  /**
   * Handle authorization flow
   * @param req
   * @param res
   * @param method
   * @param path
   * @param context
   * @returns
   */
  private async handleAuthorizationFlow(req: IncomingMessage, res: ServerResponse, method: string, path: string, context: Record<string, any>): Promise<boolean> {
    const allowedAccess = await this.isAllowedAccess(context);
    if (!allowedAccess) {
      if (context.page && getConfig().redirect.pageRequest.e403) {
        sendRedirect(res, getConfig().redirect.pageRequest.e403);
      } else {
        sendErrorResponse(req, 403, 'Forbidden', res);
      }

      return true;
    }

    return false;
  }

  /**
   * Check if access is allowed
   * @param context
   * @returns
   */
  private async isAllowedAccess(context: Record<string, any>): Promise<boolean> {
    const { claimPaths } = getConfig().jwt;
    const mapping: Mapping = context.mapping;
    const { claims } = mapping;

    const matchingClaims: Record<string, string[]> = {};
    const allClaims: Record<string, string[]> = {};

    if (!claims) {
      this.logger.child({mapping}).warn('Unable to find claims in the mapping');
      return false;
    }

    const jwtClaims = this.extractJWTClaims([
      context.accessTokenJWT,
      context.idTokenJWT,
    ], claimPaths);

    let pass = false;
    for (const key of Object.keys(claims)) {
      matchingClaims[key] = [];
      const expectedKeyClaims = claims[key];
      const jwtKeyClaims = allClaims[key] = jwtClaims[key];

      if (jwtKeyClaims?.length) {
        const intersection = expectedKeyClaims.filter(claim => jwtKeyClaims.includes(claim));
        if (intersection.length) {
          matchingClaims[key] = intersection;
          pass = true;
        }
      }
    }

    context.claims = {
      all: allClaims,
      matching: matchingClaims,
    };

    if (pass) {
      this.logger.child({matchingClaims}).info('Found intersection of claims, access allowed');
      return true;
    }

    this.logger.child({
      expectedClaims: claims,
      actualClaims: jwtClaims,
    }).info('No intersection of claims found, access forbidden');
    return false;
  }

  /**
   * Extract JWT Claims for paths from all tokens
   * @param tokens
   * @param claimPaths
   * @returns
   */
  private extractJWTClaims(tokens: Jwt[], claimPaths: Record<string, string[]>): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const name of Object.keys(claimPaths)) {
      const claims: string[] = [];
      const claimPath = claimPaths[name];

      for (const jwt of tokens) {
        if (jwt) {
          let target: any = jwt.payload;
          let fail = false;
          for (let path of claimPath) {
            if (target[path]) {
              target = target[path];
            } else {
              fail = true;
              break;
            }
          }

          if (!fail) {
            claims.push(...target);
          }
        }
      }

      result[name] = claims;
    }

    return result;
  }

  /**
   * Parse and verify token
   */
  private async parseTokenAndVerify(token: string): Promise<{jwt: Jwt, verificationResult: JWTVerificationResult}> {
    let jwt: Jwt;
    let verificationResult: JWTVerificationResult = JWTVerificationResult.MISSING;

    if (token) {
      jwt = decode(token, {
        complete: true,
      });
      verificationResult = await OpenIDUtils.verifyJWT(token, jwt);
    }

    return {
      jwt,
      verificationResult
    }
  }

  /**
   * Check if request is matching method
   * @param mappings
   * @param method
   * @param path
   * @returns
   */
  private findMatchingMapping(mappings: Mapping[], method: HttpMethod, path: string): Mapping | null {
    for (const mapping of mappings) {
      const matchMethod = !mapping.methods || mapping.methods.find(m => m === method);
      if (matchMethod && mapping.pattern.exec(path)) {
        return mapping;
      }
    }

    return null;
  }
}

