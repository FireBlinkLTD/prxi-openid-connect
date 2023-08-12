import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { invalidateAuthCookies, sendJsonResponse, sendRedirect, setAuthCookies, setCookies } from "../utils/ResponseUtils";
import { parse } from 'cookie';
import { Mapping, getConfig } from "../ServerConfig";
import { JWTVerificationResult, OpenIDUtils } from "../utils/OpenIDUtils";
import { decode, Jwt } from 'jsonwebtoken';
export class ProxyHandler implements RequestHandlerConfig {
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
      context.public = true;

      return true;
    }

    context.mapping = this.findMatchingMapping(
      getConfig().mappings.api,
      method,
      path
    );

    if (context.mapping) {
      context.api = true;

      return true;
    }

    context.mapping = this.findMatchingMapping(
      getConfig().mappings.pages,
      method,
      path
    );

    if (context.mapping) {
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

    await proxyRequest();
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

    let accessToken = cookies[getConfig().cookies.names.accessToken];
    let idToken = cookies[getConfig().cookies.names.idToken];
    let refreshToken = cookies[getConfig().cookies.names.idToken];

    let { jwt: accessTokenJWT, verificationResult: accessTokenVerificationResult } = await this.parseTokenAndVerify(accessToken);

    // if access token is missing or expired attempt to refresh tokens
    if(accessTokenVerificationResult === JWTVerificationResult.MISSING || accessTokenVerificationResult === JWTVerificationResult.EXPIRED) {
      let { verificationResult: refreshTokenVerificationResult } = await this.parseTokenAndVerify(accessToken);
      if (refreshTokenVerificationResult === JWTVerificationResult.SUCCESS) {
        const tokens = await OpenIDUtils.refreshTokens(refreshToken);
        setAuthCookies(res, tokens);

        accessToken = tokens.access_token;
        idToken = tokens.id_token;
        refreshToken = tokens.refresh_token;

        const accessVerification = await this.parseTokenAndVerify(accessToken);
        accessTokenJWT = accessVerification.jwt;
        accessTokenVerificationResult = accessVerification.verificationResult;
      }
    }

    if (accessTokenVerificationResult === JWTVerificationResult.MISSING) {
      setCookies(res, {
        [getConfig().cookies.names.originalPath]: {
          value: path,
          expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        }
      });

      await sendRedirect(res, OpenIDUtils.getAuthorizationUrl());

      return true;
    }

    if (accessTokenVerificationResult !== JWTVerificationResult.SUCCESS) {
      if (context.api) {
        // 401
        sendJsonResponse(401, {
          error: {
            status: 401,
            message: 'Unauthorized'
          }
        }, res);

        return true;
      }

      // for page request redirect to the login page
      invalidateAuthCookies(res);
      await sendRedirect(res, OpenIDUtils.getAuthorizationUrl());
      return true;
    }

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
    const { claimPaths } = getConfig().jwt;
    const { mapping, api } = context;
    const { claims } = mapping;

    const jwtClaims = [];

    return false;
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

