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
import { Debugger } from "../../utils/Debugger";
import { Context } from "../../types/Context";

export class Http2ProxyHandler implements Http2RequestHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('Http2ProxyHandler')
  }

  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const debug = context.debugger.child('Http2ProxyHandler -> isMatching', { method, path });

    debug.event('Looking for public matches');
    context.mapping = this.findMatchingMapping(
      debug,
      getConfig().mappings.public,
      method,
      path
    );

    if (context.mapping) {
      debug.event('Handling public mapping');
      context.public = true;

      return true;
    }

    debug.event('Looking for API matches');
    context.mapping = this.findMatchingMapping(
      debug,
      getConfig().mappings.api,
      method,
      path
    );

    if (context.mapping) {
      debug.event('Handling API mapping');
      context.api = true;

      return true;
    }

    debug.event('Looking for pages matches');
    context.mapping = this.findMatchingMapping(
      debug,
      getConfig().mappings.pages,
      method,
      path
    );

    if (context.mapping) {
      debug.event('Handling page mapping');
      context.page = true;

      return true;
    }

    debug.event('No mappings found');
    return false
  }

  /**
   * @inheritdoc
   */
  async handle(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    const debug = context.debugger.child('Http2ProxyHandler -> handle', { context, headers, method, path });
    const cookies = RequestUtils.getCookies(headers);
    debug.event('getCookies', { cookies, public: context.public });

    // skip JWT validation for public mappings
    if (context.public) {
      debug.event('Proxy request for the public mapping');
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
      debug.event('Meta cookie found, processing');
      metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
        complete: false,
      });
    }

    let { reject: breakFlow, cookiesToSet} = await this.handleAuthenticationFlow(
      debug.child('-> handleAuthenticationFlow'),
      stream,
      headers,
      cookies,
      method,
      path,
      context,
      metaPayload?.p
    );
    if (breakFlow) {
      debug.event('Breaking upon authentication');
      return;
    }

    breakFlow = this.handleAuthorizationFlow(
      debug.child('-> handleAuthorizationFlow'),
      stream,
      headers,
      method,
      path,
      context
    );
    if (breakFlow) {
      debug.event('Breaking upon authorization');
      return;
    }

    const proxyRequestHeaders: Record<string, string | string[] | null> = {};
    if (getConfig().headers.claims.auth.all) {
      const value = JSON.stringify(context.claims?.auth?.all || {});
      debug.event('Adding "claims.auth.all" header', {
        name: getConfig().headers.claims.auth.all,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.auth.all] = value;
    }

    if (getConfig().headers.claims.auth.matching) {
      const value = JSON.stringify(context.claims?.auth?.matching || {});
      debug.event('Adding "claims.auth.matching" header', {
        name: getConfig().headers.claims.auth.matching,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.auth.matching] = value;
    }

    if (getConfig().headers.claims.proxy) {
      const value = JSON.stringify(context.claims?.proxy || {});
      debug.event('Adding "claims.auth.proxy" header', {
        name: getConfig().headers.claims.proxy,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.proxy] = value;
    }

    if (getConfig().headers.meta && metaPayload?.p) {
      const value = JSON.stringify(metaPayload.p);
      debug.event('Adding "meta" header', {
        name: getConfig().headers.meta,
        value,
      });
      proxyRequestHeaders[getConfig().headers.meta] = value;
    }

    proxyRequestHeaders['cookie'] = RequestUtils.prepareProxyCookies(headers, cookies);
    if (Object.keys(cookiesToSet).length) {
      const value = prepareSetCookies(cookiesToSet);
      debug.event('Adding cookie header', {
        name: 'Set-Cookie',
        value,
      });
      proxyRequestHeaders['Set-Cookie'] = value;
    }

    debug.event('Proceeding to proxy request');
    await proxyRequest({
      proxyRequestHeaders,
      onBeforeResponse: (_: Response, outgoingHeaders: OutgoingHttpHeaders) => {
        const d = debug.child('-> proxyRequest -> onBeforeResponse');
        const setCookieName = 'set-cookie';
        const setCookieHeader = outgoingHeaders[setCookieName];
        if (setCookieHeader) {
          d.event('Set-Cookie header exists in the response');
          const outgoingCookieHeader = outgoingHeaders[setCookieName];
          if (!outgoingCookieHeader) {
            d.event('No need to merge cookies, set as is', {
              value: setCookieHeader,
            });
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

            d.event('Cookies merged', {
              value: cookies,
            });
            outgoingHeaders[setCookieName] = cookies;
          }
        }
        d.event('End');
      }
    });
  }

  /**
   * Handle authentication flow
   * @param debug
   * @param stream
   * @param headers
   * @param cookies
   * @param method
   * @param path
   * @param context
   * @param metaPayload
   * @returns
   */
  private async handleAuthenticationFlow(debug: Debugger, stream: ServerHttp2Stream, headers: IncomingHttpHeaders, cookies: Record<string, string>, method: string, path: string, context: Record<string, any>, metaPayload: Record<string, any>): Promise<{
    reject: boolean,
    cookiesToSet?: Record<string, {value: string, expires?: Date}>,
  }> {
    debug.event('Handling authentication flow', {
      cookies,
      path,
      method,
      context,
      headers
    })

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
        debug.event('Refreshing token', { refreshToken, accessTokenVerificationResult, idTokenVerificationResult });
        const tokens = await OpenIDUtils.refreshTokens(refreshToken);

        let metaToken;
        if (metaPayload) {
          metaToken = OpenIDUtils.prepareMetaToken(metaPayload);
          debug.event('Meta token prepared', { metaToken });
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
        debug.event('Unable to refresh token', { e });
        this.logger.info(`Unable to refresh token`);

        accessToken = context.accessToken = null;
        idToken = context.idToken = null;
        refreshToken = context.refreshToken = null;

        accessTokenVerificationResult = JWTVerificationResult.MISSING;
      }
    }

    if (accessTokenVerificationResult === JWTVerificationResult.MISSING) {
      debug.event('Access token is missing');
      if (context.page) {
        let query = '';
        let queryIdx = headers[constants.HTTP2_HEADER_PATH].indexOf('?');
        if (queryIdx >= 0) {
          query = headers[constants.HTTP2_HEADER_PATH].toString().substring(queryIdx);
        }

        debug.event('Preparing auth cookies to be invalidated, keeping original path', {
          value: path + query,
        });
        cookiesToSet = prepareInvalidatedAuthCookies({
          [getConfig().cookies.names.originalPath]: {
            value: path + query,
            expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          }
        })
      } else {
        debug.event('Preparing auth cookies to be invalidated');
        cookiesToSet = prepareInvalidatedAuthCookies();
      }

      if (context.mapping.auth.required) {
        if (context.page) {
          debug.event('Auth required, sending redirect to the auth page');
          sendRedirect(stream, headers, OpenIDUtils.getAuthorizationUrl());
        } else {
          debug.event('Auth required, sending 401 error response');
          sendErrorResponse(stream, headers, 401, 'Unauthorized');
        }

        debug.event('Access token is missing but mapping requires auth');
        return {
          reject: true
        };
      } else {
        debug.event('Access token is missing and auth isn\'t required');
        delete context.idTokenJWT;
        delete context.accessTokenJWT;
      }
    } else if (accessTokenVerificationResult !== JWTVerificationResult.SUCCESS) {
      debug.event('Access token verification failed', {
        accessTokenVerificationResult,
      });

      const cookiesToSet = prepareSetCookies(prepareInvalidatedAuthCookies());
      if (context.page) {
        debug.event('Sending redirect to the auth page', {
          cookiesToSet,
        });

        sendRedirect(stream, headers, OpenIDUtils.getAuthorizationUrl(), {
          'Set-Cookie': cookiesToSet,
        });
      } else {
        debug.event('Sending 401 error', {
          cookiesToSet,
        });

        sendErrorResponse(stream, headers, 401, 'Unauthorized', {
          'Set-Cookie': cookiesToSet,
        });
      }

      this.logger.debug('Access token is invalid but mapping requires auth');
      return {
        reject: true
      };
    }

    this.logger.debug('Authentication flow passes');
    return {
      reject: false,
      cookiesToSet,
    };
  }

  /**
   * Handle authorization flow
   * @param debug
   * @param req
   * @param res
   * @param method
   * @param path
   * @param context
   * @returns
   */
  private handleAuthorizationFlow(debug: Debugger, stream: ServerHttp2Stream, headers: IncomingHttpHeaders, method: string, path: string, context: Record<string, any>): boolean {
    const claims = RequestUtils.isAllowedAccess(this.logger, context.accessTokenJWT, context.idTokenJWT, context.mapping);
    debug.event('-> RequestUtils.isAllowedAccess()', { claims });

    if (!claims) {
      if (context.page && getConfig().redirect.pageRequest.e403) {
        debug.event('No claims extracted, sending redirect to custom 403 page', {
          redirectTo: getConfig().redirect.pageRequest.e403,
        })
        sendRedirect(stream, headers, getConfig().redirect.pageRequest.e403);
      } else {
        debug.event('No claims extracted, sending 403 response');
        sendErrorResponse(stream, headers, 403, 'Forbidden');
      }

      return true;
    }

    context.claims = claims;
    debug.event('Access allowed', { context });

    return false;
  }

  /**
   * Check if request is matching method
   * @param debug
   * @param mappings
   * @param method
   * @param path
   * @returns
   */
  private findMatchingMapping(debug: Debugger, mappings: Mapping[], method: HttpMethod, path: string): Mapping | null {
    debug.event('Looking for a match', {
      method,
      path
    });
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
          debug.event('Match found');
          return mapping;
        }
      }
    }

    debug.event('No matches found');
    return null;
  }
}

