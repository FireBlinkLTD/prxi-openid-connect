import { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from 'prxi';
import { invalidateAuthCookies, sendErrorResponse, sendRedirect, setAuthCookies } from '../../utils/ResponseUtils';
import { getConfig } from '../../config/getConfig';
import { Mapping } from '../../config/Mapping';
import { JWTVerificationResult, OpenIDUtils } from '../../utils/OpenIDUtils';
import { JwtPayload, verify } from 'jsonwebtoken';
import { RequestUtils } from '../../utils/RequestUtils';
import { Context } from '../../types/Context';
import { Debugger } from '../../utils/Debugger';

export class ProxyHandler implements HttpRequestHandlerConfig {
  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const _ = context.debugger.child('ProxyHandler -> isMatching', {method, path});

    _.debug('Looking for public matches');
    context.mapping = RequestUtils.findMapping(
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
    context.mapping = RequestUtils.findMapping(
      _,
      getConfig().mappings.api,
      method,
      path
    );

    if (context.mapping) {
      _.debug('Handling api mapping');
      context.api = true;

      return true;
    }

    _.debug('Looking for page matches');
    context.mapping = RequestUtils.findMapping(
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

    return false
  }

  /**
   * @inheritdoc
   */
  async handle(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: string, path: string, context: Context): Promise<void> {
    const _ = context.debugger.child('ProxyHandler -> handle', {method, path, context, headers: req.headers});
    const cookies = RequestUtils.getCookies(req.headers);
    _.debug('-> RequestUtils.getCookies', { cookies });

    // skip JWT validation for public mappings
    if (context.public) {
      _.debug('Proxy request for the public mapping');
      await proxyRequest({
        proxyRequestHeaders: {
          'cookie': RequestUtils.prepareProxyCookies(req.headers, cookies),
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

    let breakFlow = await this.handleAuthenticationFlow(
      _.child('-> handleAuthenticationFlow'),
      cookies,
      req,
      res,
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
      req,
      res,
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

    proxyRequestHeaders['cookie'] = RequestUtils.prepareProxyCookies(req.headers, cookies);

    _.debug('Proceeding to proxy request', { proxyRequestHeaders });
    await proxyRequest({
      proxyRequestHeaders,
      onBeforeResponse: (res: ServerResponse, outgoingHeaders: OutgoingHttpHeaders) => {
        const d = _.child('-> proxyRequest -> onBeforeResponse', { outgoingHeaders });
        const setCookieName = 'set-cookie';
        const setCookieHeader = res.getHeader(setCookieName);
        if (setCookieHeader) {
          d.debug('Set-Cookie header exists in the response');
          const outgoingCookieHeader = outgoingHeaders[setCookieName];
          if (!outgoingCookieHeader) {
            d.debug('No need to merge cookies, set as is', {
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

            d.debug('Cookies merged', {
              value: cookies,
            });
            outgoingHeaders[setCookieName] = cookies;
          }
        }
        d.debug('End');
      }
    });
  }

  /**
   * Handle authentication flow
   * @param _
   * @param cookies
   * @param req
   * @param res
   * @param method
   * @param path
   * @param context
   * @returns
   */
  private async handleAuthenticationFlow(
    _: Debugger,
    cookies: Record<string, string>,
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
    path: string,
    context: Context,
    metaPayload: Record<string, any>,
  ): Promise<boolean> {
    _.debug('Handling authentication flow', {
      cookies,
      path,
      method,
      context
    });

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

        setAuthCookies(res, tokens, metaToken);

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
        let queryIdx = req.url.indexOf('?');
        if (queryIdx >= 0) {
          query = req.url.substring(queryIdx);
        }

        _.debug('Invalidating auth cookies, keeping original path', {
          value: path + query,
        });
        invalidateAuthCookies(res, {
          [getConfig().cookies.names.originalPath]: {
            value: path + query,
            expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          }
        });
      } else {
        _.debug('Invalidating auth cookies');
        invalidateAuthCookies(res);
      }

      if (context.mapping.auth.required) {
        if (context.page) {
          await sendRedirect(_, req, res, OpenIDUtils.getAuthorizationUrl());
        } else {
          await sendErrorResponse(_, req, 401, 'Unauthorized', res);
        }

        _.debug('Access token is missing but mapping requires auth');
        return true;
      } else {
        _.debug('Access token is missing and auth isn\'t required');
        delete context.idTokenJWT;
        delete context.accessTokenJWT;
      }
    } else if (accessTokenVerificationResult !== JWTVerificationResult.SUCCESS) {
      _.debug('Access token verification failed', {
        accessTokenVerificationResult,
      });

      invalidateAuthCookies(res);

      if (context.page) {
        await sendRedirect(_, req, res, OpenIDUtils.getAuthorizationUrl());
      } else {
        sendErrorResponse(_, req, 401, 'Unauthorized', res);
      }

      _.debug('Access token is invalid but mapping requires auth');
      return true;
    }

    _.debug('Authentication flow passes');
    return false;
  }

  /**
   * Handle authorization flow
   * @param _
   * @param req
   * @param res
   * @param method
   * @param path
   * @param context
   * @returns
   */
  private handleAuthorizationFlow(
    _: Debugger,
    req: IncomingMessage,
    res: ServerResponse,
    method: string, path: string,
    context: Context,
  ): boolean {
    const claims = RequestUtils.isAllowedAccess(_.child('RequestUtils'), context.accessTokenJWT, context.idTokenJWT, context.mapping);
    _.debug('-> RequestUtils.isAllowedAccess()', { claims });

    if (!claims) {
      if (context.page && getConfig().redirect.pageRequest.e403) {
        sendRedirect(_, req, res, getConfig().redirect.pageRequest.e403);
      } else {
        sendErrorResponse(_, req, 403, 'Forbidden', res);
      }

      return true;
    }

    context.claims = claims;
    _.debug('Access allowed', { context });

    return false;
  }
}

