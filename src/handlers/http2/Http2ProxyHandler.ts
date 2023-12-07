import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig, Response } from "prxi";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";
import { getConfig } from "../../config/getConfig";
import { Mapping } from "../../config/Mapping";
import { JWTVerificationResult, OpenIDUtils } from "../../utils/OpenIDUtils";
import { JwtPayload, verify } from 'jsonwebtoken';
import getLogger from "../../Logger";
import { Logger } from "pino";
import { RequestUtils } from "../../utils/RequestUtils";
import { IncomingHttpHeaders, OutgoingHttpHeaders, ServerHttp2Stream, constants } from "http2";
import { prepareInvalidatedAuthCookies, prepareSetCookies, prepareAuthCookies } from "../../utils/ResponseUtils";

export class Http2ProxyHandler implements Http2RequestHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('Http2ProxyHandler')
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
      this.logger.child({mapping: context.mapping}).debug('Handling public mapping');
      context.public = true;

      return true;
    }

    context.mapping = this.findMatchingMapping(
      getConfig().mappings.api,
      method,
      path
    );

    if (context.mapping) {
      this.logger.child({mapping: context.mapping}).debug('Handling api mapping');
      context.api = true;

      return true;
    }

    context.mapping = this.findMatchingMapping(
      getConfig().mappings.pages,
      method,
      path
    );

    if (context.mapping) {
      this.logger.child({mapping: context.mapping}).debug('Handling page mapping');
      context.page = true;

      return true;
    }

    return false
  }

  /**
   * @inheritdoc
   */
  async handle(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Record<string, any>) {
    const cookies = RequestUtils.getCookies(headers);

    // skip JWT validation for public mappings
    if (context.public) {
      await proxyRequest({
        proxyRequestHeaders: {
          'cookie': RequestUtils.prepareProxyCookies(headers, cookies),
        }
      });

      return;
    }

    let metaPayload: Record<string, any> = null;
    const metaToken = cookies[getConfig().cookies.names.meta];
    if (metaToken) {
      metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
        complete: false,
      });
    }

    let { reject: breakFlow, cookiesToSet} =  await this.handleAuthenticationFlow(stream, headers, cookies, method, path, context, metaPayload?.p);
    if (breakFlow) {
      return;
    }

    breakFlow = this.handleAuthorizationFlow(stream, headers, method, path, context);
    if (breakFlow) {
      return;
    }

    const proxyRequestHeaders: Record<string, string | string[] | null> = {};
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

    proxyRequestHeaders['cookie'] = RequestUtils.prepareProxyCookies(headers, cookies);
    if (Object.keys(cookiesToSet).length) {
      proxyRequestHeaders['Set-Cookie'] = prepareSetCookies(cookiesToSet);
    }
    await proxyRequest({
      proxyRequestHeaders,
      onBeforeResponse: (_: Response, outgoingHeaders: OutgoingHttpHeaders) => {
        const setCookieName = 'set-cookie';
        const setCookieHeader = outgoingHeaders[setCookieName];
        if (setCookieHeader) {
          const outgoingCookieHeader = outgoingHeaders[setCookieName];
          if (!outgoingCookieHeader) {
            // when no need to merge cookies
            outgoingHeaders[setCookieName] = <string | string[]> setCookieHeader;
          } else {
            // merge cookies
            const cookies: Array<string> = [];

            // merge function
            const merge = (cookiesToSet: string | number | string[]) => {
              /* istanbul ignore else */
              if (Array.isArray(cookiesToSet)) {
                for(const cookie of cookiesToSet) {
                  cookies.push(cookie);
                }
              } else {
                cookies.push(cookiesToSet.toString())
              }
            }

            // merge cookies
            merge(outgoingCookieHeader);
            merge(setCookieHeader);

            outgoingHeaders[setCookieName] = cookies;
          }
        }
      }
    });
  }

  /**
   * Handle authentication flow
   * @param stream
   * @param headers
   * @param cookies
   * @param method
   * @param path
   * @param context
   * @param metaPayload
   * @returns
   */
  private async handleAuthenticationFlow(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, cookies: Record<string, string>, method: string, path: string, context: Record<string, any>, metaPayload: Record<string, any>): Promise<{
    reject: boolean,
    cookiesToSet?: Record<string, {value: string, expires?: Date}>,
  }> {
    let cookiesToSet = {};
    let accessToken = context.accessToken = cookies[getConfig().cookies.names.accessToken];
    let idToken = context.idToken = cookies[getConfig().cookies.names.idToken];
    let refreshToken = context.refreshToken = cookies[getConfig().cookies.names.refreshToken];

    let { jwt: accessTokenJWT, verificationResult: accessTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(accessToken);
    let { jwt: idTokenJWT, verificationResult: idTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(context.idTokenJWT);

    context.accessTokenJWT = accessTokenJWT;
    context.idTokenJWT = idTokenJWT;

    // if access token is missing or expired attempt to refresh tokens
    if(
      refreshToken &&
      (
        accessTokenVerificationResult === JWTVerificationResult.MISSING ||
        accessTokenVerificationResult === JWTVerificationResult.EXPIRED ||
        idTokenVerificationResult === JWTVerificationResult.EXPIRED
      )
    ) {
      try {
        const tokens = await OpenIDUtils.refreshTokens(refreshToken);

        let metaToken;
        if (metaPayload) {
          metaToken = OpenIDUtils.prepareMetaToken(metaPayload);
        }

        cookiesToSet = prepareAuthCookies(tokens, metaToken);

        accessToken = context.accessToken = tokens.access_token;
        idToken = context.idToken = tokens.id_token;
        refreshToken = context.refreshToken = tokens.refresh_token;

        const accessVerification = await OpenIDUtils.parseTokenAndVerify(accessToken);
        const idVerification = await OpenIDUtils.parseTokenAndVerify(idToken);
        accessTokenVerificationResult = accessVerification.verificationResult;

        context.accessTokenJWT = accessVerification.jwt;
        context.idTokenJWT = idVerification.jwt;
      } catch (e) {
        this.logger.info(`Unable to refresh token`);

        accessToken = context.accessToken = null;
        idToken = context.idToken = null;
        refreshToken = context.refreshToken = null;

        accessTokenVerificationResult = JWTVerificationResult.MISSING;
      }
    }

    if (accessTokenVerificationResult === JWTVerificationResult.MISSING) {
      if (context.page) {
        let query = '';
        let queryIdx = headers[constants.HTTP2_HEADER_PATH].indexOf('?');
        if (queryIdx >= 0) {
          query = headers[constants.HTTP2_HEADER_PATH].toString().substring(queryIdx);
        }

        cookiesToSet = prepareInvalidatedAuthCookies({
          [getConfig().cookies.names.originalPath]: {
            value: path + query,
            expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          }
        })
      } else {
        cookiesToSet = prepareInvalidatedAuthCookies();
      }

      if (context.mapping.auth.required) {
        if (context.page) {
          sendRedirect(stream, headers, OpenIDUtils.getAuthorizationUrl());
        } else {
          sendErrorResponse(stream, headers, 401, 'Unauthorized');
        }

        return {
          reject: true
        };
      } else {
        delete context.idTokenJWT;
        delete context.accessTokenJWT;
      }
    } else if (accessTokenVerificationResult !== JWTVerificationResult.SUCCESS) {

      if (context.page) {
        sendRedirect(stream, headers, OpenIDUtils.getAuthorizationUrl(), {
          'Set-Cookie': prepareSetCookies(prepareInvalidatedAuthCookies()),
        });
      } else {
        sendErrorResponse(stream, headers, 401, 'Unauthorized', {
          'Set-Cookie': prepareSetCookies(prepareInvalidatedAuthCookies()),
        });
      }

      return {
        reject: true
      };
    }

    return {
      reject: false,
      cookiesToSet,
    };
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
  private handleAuthorizationFlow(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, method: string, path: string, context: Record<string, any>): boolean {
    const claims = RequestUtils.isAllowedAccess(this.logger, context.accessTokenJWT, context.idTokenJWT, context.mapping);

    if (!claims) {
      if (context.page && getConfig().redirect.pageRequest.e403) {
        sendRedirect(stream, headers, getConfig().redirect.pageRequest.e403);
      } else {
        sendErrorResponse(stream, headers, 403, 'Forbidden');
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
        let exclude = false;
        for (const excludeMapping of mapping.exclude) {
          const excludeMethodMatch = !mapping.methods || mapping.methods.find(m => m === method);
          exclude = excludeMethodMatch && !!excludeMapping.pattern.exec(path);
          if (exclude) {
            continue;
          }
        }

        if (!exclude) {
          return mapping;
        }
      }
    }

    return null;
  }
}

