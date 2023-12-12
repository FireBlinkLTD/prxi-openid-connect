import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig, Response } from "prxi";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";
import { getConfig } from "../../config/getConfig";
import { Mapping } from "../../config/Mapping";
import { JWTVerificationResult, OpenIDUtils } from "../../utils/OpenIDUtils";
import { JwtPayload, verify } from 'jsonwebtoken';
import { RequestUtils } from "../../utils/RequestUtils";
import { IncomingHttpHeaders, OutgoingHttpHeaders, ServerHttp2Stream, constants } from "http2";
import { prepareInvalidatedAuthCookies, prepareSetCookies, prepareAuthCookies } from "../../utils/ResponseUtils";
import { Debugger } from "../../utils/Debugger";
import { Context } from "../../types/Context";

export class Http2ProxyHandler implements Http2RequestHandlerConfig {
  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const _ = context.debugger.child('Http2ProxyHandler -> isMatching', { method, path });

    _.debug('Looking for public matches');
    context.mapping = this.findMatchingMapping(
      _,
      getConfig().mappings.public,
      method,
      path
    );

    if (context.mapping) {
      _.debug('Handling public mapping');
      context.public = true;

      return true;
    }

    _.debug('Looking for API matches');
    context.mapping = this.findMatchingMapping(
      _,
      getConfig().mappings.api,
      method,
      path
    );

    if (context.mapping) {
      _.debug('Handling API mapping');
      context.api = true;

      return true;
    }

    _.debug('Looking for page matches');
    context.mapping = this.findMatchingMapping(
      _,
      getConfig().mappings.pages,
      method,
      path
    );

    if (context.mapping) {
      _.debug('Handling page mapping');
      context.page = true;

      return true;
    }

    _.debug('No mappings found');
    return false
  }

  /**
   * @inheritdoc
   */
  async handle(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    const _ = context.debugger.child('Http2ProxyHandler -> handle', { context, headers, method, path });
    const cookies = RequestUtils.getCookies(headers);
    _.debug('-> RequestUtils.getCookies', { cookies });

    // skip JWT validation for public mappings
    if (context.public) {
      _.debug('Proxy request for the public mapping');
      const cookie = RequestUtils.prepareProxyCookies(headers, cookies);
      _.debug('Cookie header', { cookie });
      await proxyRequest({
        proxyRequestHeaders: {
          'cookie': cookie,
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
      _.debug('Meta cookie found', { metaPayload });
    }

    let { reject: breakFlow, cookiesToSet} = await this.handleAuthenticationFlow(
      _.child('-> handleAuthenticationFlow'),
      stream,
      headers,
      cookies,
      method,
      path,
      context,
      metaPayload?.p
    );
    if (breakFlow) {
      _.debug('Breaking upon authentication');
      return;
    }

    breakFlow = this.handleAuthorizationFlow(
      _.child('-> handleAuthorizationFlow'),
      stream,
      headers,
      method,
      path,
      context
    );
    if (breakFlow) {
      _.debug('Breaking upon authorization');
      return;
    }

    const proxyRequestHeaders: Record<string, string | string[] | null> = {};
    if (getConfig().headers.claims.auth.all) {
      const value = JSON.stringify(context.claims?.auth?.all || {});
      _.debug('Adding "claims.auth.all" header', {
        name: getConfig().headers.claims.auth.all,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.auth.all] = value;
    }

    if (getConfig().headers.claims.auth.matching) {
      const value = JSON.stringify(context.claims?.auth?.matching || {});
      _.debug('Adding "claims.auth.matching" header', {
        name: getConfig().headers.claims.auth.matching,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.auth.matching] = value;
    }

    if (getConfig().headers.claims.proxy) {
      const value = JSON.stringify(context.claims?.proxy || {});
      _.debug('Adding "claims.proxy" header', {
        name: getConfig().headers.claims.proxy,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.proxy] = value;
    }

    if (getConfig().headers.meta && metaPayload?.p) {
      const value = JSON.stringify(metaPayload.p);
      _.debug('Adding "meta" header', {
        name: getConfig().headers.meta,
        value,
      });
      proxyRequestHeaders[getConfig().headers.meta] = value;
    }

    proxyRequestHeaders['cookie'] = RequestUtils.prepareProxyCookies(headers, cookies);

    let outgoingSetCookies: string[];
    if (Object.keys(cookiesToSet).length) {
      outgoingSetCookies = prepareSetCookies(cookiesToSet);
    }

    _.debug('Proceeding to proxy request', { proxyRequestHeaders, outgoingSetCookies });
    await proxyRequest({
      proxyRequestHeaders,
      onBeforeResponse: (resp: Response, outgoingHeaders: OutgoingHttpHeaders) => {
        const d = _.child('-> proxyRequest -> onBeforeResponse', {outgoingHeaders});
        const setCookieName = 'set-cookie';
        const setCookieHeader = outgoingHeaders[setCookieName];
        if (setCookieHeader || outgoingSetCookies) {
          d.debug('Set-Cookie header exists in the response or need to add more cookies');
          if (!outgoingSetCookies) {
            d.debug('No need to merge cookies, set as is', {
              value: setCookieHeader,
            });
            // when no need to merge cookies
            outgoingHeaders[setCookieName] = <string | string[]> setCookieHeader;
          } else if (!setCookieHeader) {
            outgoingHeaders[setCookieName] = outgoingSetCookies;
          } else {
            // merge cookies
            const cookies = new Set<string>();

            // merge function
            const merge = (cookiesToSet: string | number | string[]) => {
              /* istanbul ignore else */
              if (Array.isArray(cookiesToSet)) {
                for(const cookie of cookiesToSet) {
                  cookies.add(cookie);
                }
              } else {
                cookies.add(cookiesToSet.toString())
              }
            }

            // merge cookies
            merge(outgoingSetCookies);
            merge(setCookieHeader);

            d.debug('Cookies merged', {
              value: cookies,
            });
            outgoingHeaders[setCookieName] = [...cookies];
          }
        }
        d.debug('End');
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
  private async handleAuthenticationFlow(_: Debugger, stream: ServerHttp2Stream, headers: IncomingHttpHeaders, cookies: Record<string, string>, method: string, path: string, context: Context, metaPayload: Record<string, any>): Promise<{
    reject: boolean,
    cookiesToSet?: Record<string, {value: string, expires?: Date}>,
  }> {
    _.debug('Handling authentication flow', {
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
    let { jwt: idTokenJWT, verificationResult: idTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(idToken);

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
        _.debug('Refreshing token', { refreshToken, accessTokenVerificationResult, idTokenVerificationResult });
        const tokens = await OpenIDUtils.refreshTokens(refreshToken);
        _.debug('-> OpenIDUtils.refreshTokens()', { tokens });

        let metaToken;
        if (metaPayload) {
          metaToken = OpenIDUtils.prepareMetaToken(metaPayload);
          _.debug('Meta token prepared', { metaToken });
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
        _.error(`Unable to refresh token`, e);

        accessToken = context.accessToken = null;
        idToken = context.idToken = null;
        refreshToken = context.refreshToken = null;

        accessTokenVerificationResult = JWTVerificationResult.MISSING;
      }
    }

    if (accessTokenVerificationResult === JWTVerificationResult.MISSING) {
      _.debug('Access token is missing');
      if (context.page) {
        let query = '';
        let queryIdx = headers[constants.HTTP2_HEADER_PATH].indexOf('?');
        if (queryIdx >= 0) {
          query = headers[constants.HTTP2_HEADER_PATH].toString().substring(queryIdx);
        }

        _.debug('Preparing auth cookies to be invalidated, keeping original path', {
          value: path + query,
        });
        cookiesToSet = prepareInvalidatedAuthCookies({
          [getConfig().cookies.names.originalPath]: {
            value: path + query,
            expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          }
        })
      } else {
        _.debug('Preparing auth cookies to be invalidated');
        cookiesToSet = prepareInvalidatedAuthCookies();
      }

      if (context.mapping.auth.required) {
        if (context.page) {
          _.debug('Auth required, sending redirect to the auth page');
          sendRedirect(_, stream, headers, OpenIDUtils.getAuthorizationUrl(), {
            'Set-Cookie': prepareSetCookies(cookiesToSet),
          });
        } else {
          _.debug('Auth required, sending 401 error response');
          sendErrorResponse(_, stream, headers, 401, 'Unauthorized', {
            'Set-Cookie': prepareSetCookies(cookiesToSet),
          });
        }

        _.debug('Access token is missing but mapping requires auth');
        return {
          reject: true
        };
      } else {
        _.debug('Access token is missing and auth isn\'t required');
        delete context.idTokenJWT;
        delete context.accessTokenJWT;
      }
    } else if (accessTokenVerificationResult !== JWTVerificationResult.SUCCESS) {
      _.debug('Access token verification failed', {
        accessTokenVerificationResult,
      });

      const cookiesToSet = prepareSetCookies(prepareInvalidatedAuthCookies());
      if (context.page) {
        _.debug('Sending redirect to the auth page', {
          cookiesToSet,
        });

        sendRedirect(_, stream, headers, OpenIDUtils.getAuthorizationUrl(), {
          'Set-Cookie': cookiesToSet,
        });
      } else {
        _.debug('Sending 401 error', {
          cookiesToSet,
        });

        sendErrorResponse(_, stream, headers, 401, 'Unauthorized', {
          'Set-Cookie': cookiesToSet,
        });
      }

      _.debug('Access token is invalid but mapping requires auth');
      return {
        reject: true
      };
    }

    _.debug('Authentication flow passes', { cookiesToSet });
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
  private handleAuthorizationFlow(_: Debugger, stream: ServerHttp2Stream, headers: IncomingHttpHeaders, method: string, path: string, context: Record<string, any>): boolean {
    const claims = RequestUtils.isAllowedAccess(_.child('RequestUtils'), context.accessTokenJWT, context.idTokenJWT, context.mapping);
    _.debug('-> RequestUtils.isAllowedAccess()', { claims });

    if (!claims) {
      if (context.page && getConfig().redirect.pageRequest.e403) {
        _.debug('No claims extracted, sending redirect to custom 403 page', {
          redirectTo: getConfig().redirect.pageRequest.e403,
        })
        sendRedirect(_, stream, headers, getConfig().redirect.pageRequest.e403);
      } else {
        _.debug('No claims extracted, sending 403 response');
        sendErrorResponse(_, stream, headers, 403, 'Forbidden');
      }

      return true;
    }

    context.claims = claims;
    _.debug('Access allowed', { context });

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
  private findMatchingMapping(_: Debugger, mappings: Mapping[], method: HttpMethod, path: string): Mapping | null {
    _.debug('Looking for a match', {
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
          _.debug('Match found');
          return mapping;
        }
      }
    }

    _.debug('No matches found');
    return null;
  }
}

