import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { invalidateAuthCookies, sendErrorResponse, sendRedirect, setAuthCookies, setCookies } from "../utils/ResponseUtils";
import { getConfig } from "../config/getConfig";
import { Mapping } from "../config/Mapping";
import { JWTVerificationResult, OpenIDUtils } from "../utils/OpenIDUtils";
import { JwtPayload, verify } from 'jsonwebtoken';
import getLogger from "../Logger";
import { Logger } from "pino";
import { RequestUtils } from "../utils/RequestUtils";

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

    const cookies = RequestUtils.getCookies(req);
    let metaPayload: Record<string, any> = null;
    const metaToken = cookies[getConfig().cookies.names.meta];
    if (metaToken) {
      metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
        complete: false,
      });
    }

    let breakFlow = await this.handleAuthenticationFlow(cookies, req, res, method, path, context, metaPayload?.p);
    if (breakFlow) {
      return;
    }

    breakFlow = this.handleAuthorizationFlow(req, res, method, path, context);
    if (breakFlow) {
      return;
    }

    const proxyRequestHeaders: Record<string, string> = {};
    if (getConfig().headers.claims.auth.all) {
      proxyRequestHeaders[getConfig().headers.claims.auth.all] = JSON.stringify(context.claims?.auth?.all || {});
    }

    if (getConfig().headers.claims.auth.matching) {
      proxyRequestHeaders[getConfig().headers.claims.auth.matching] = JSON.stringify(context.claims?.auth?.matching || {});
    }

    if (getConfig().headers.claims.proxy) {
      proxyRequestHeaders[getConfig().headers.claims.proxy] = JSON.stringify(context.claims?.proxy || {});
    }

    if (getConfig().headers.meta && metaPayload?.p) {
      proxyRequestHeaders[getConfig().headers.meta] = JSON.stringify(metaPayload.p);
    }

    await proxyRequest({
      proxyRequestHeaders,
    });
  }

  /**
   * Handle authentication flow
   * @param cookies
   * @param req
   * @param res
   * @param method
   * @param path
   * @param context
   * @returns
   */
  private async handleAuthenticationFlow(cookies: Record<string, string>, req: IncomingMessage, res: ServerResponse, method: string, path: string, context: Record<string, any>, metaPayload: Record<string, any>): Promise<boolean> {
    let accessToken = context.accessToken = cookies[getConfig().cookies.names.accessToken];
    let idToken = context.idToken = cookies[getConfig().cookies.names.idToken];
    let refreshToken = context.refreshToken = cookies[getConfig().cookies.names.idToken];

    let { jwt: accessTokenJWT, verificationResult: accessTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(accessToken);
    let { jwt: idTokenJWT, verificationResult: idTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(context.idTokenJWT);
    context.idTokenJWT = idTokenJWT;

    // if access token is missing or expired attempt to refresh tokens
    if(
      accessTokenVerificationResult === JWTVerificationResult.MISSING ||
      accessTokenVerificationResult === JWTVerificationResult.EXPIRED ||
      idTokenVerificationResult === JWTVerificationResult.EXPIRED
    ) {
      let { verificationResult: refreshTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(refreshToken);
      if (refreshTokenVerificationResult === JWTVerificationResult.SUCCESS) {
        const tokens = await OpenIDUtils.refreshTokens(refreshToken);

        let metaToken;
        if (metaPayload) {
          metaToken = OpenIDUtils.prepareMetaToken(metaPayload);
        }

        setAuthCookies(res, tokens, metaToken);

        accessToken = context.accessToken = tokens.access_token;
        idToken = context.idToken = tokens.id_token;
        refreshToken = context.refreshToken = tokens.refresh_token;

        const accessVerification = await OpenIDUtils.parseTokenAndVerify(accessToken);
        const idVerification = await OpenIDUtils.parseTokenAndVerify(idToken);
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
    context.accessTokenJWT = accessTokenJWT;

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
  private handleAuthorizationFlow(req: IncomingMessage, res: ServerResponse, method: string, path: string, context: Record<string, any>): boolean {
    const claims = RequestUtils.isAllowedAccess(this.logger, context.accessTokenJWT, context.idTokenJWT, context.mapping);

    if (!claims) {
      if (context.page && getConfig().redirect.pageRequest.e403) {
        sendRedirect(res, getConfig().redirect.pageRequest.e403);
      } else {
        sendErrorResponse(req, 403, 'Forbidden', res);
      }

      return true;
    }

    context.claims = claims;

    return false;
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

