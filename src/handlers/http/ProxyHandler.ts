import { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from 'prxi';
import { sendErrorResponse, sendRedirect } from '../../utils/ResponseUtils';
import { getConfig } from '../../config/getConfig';
import { JwtPayload, verify } from 'jsonwebtoken';
import { RequestUtils } from '../../utils/RequestUtils';
import { Context } from '../../types/Context';
import { Debugger } from '../../utils/Debugger';
import { handleHttpAuthenticationFlow } from '../../utils/AccessUtils';

export class ProxyHandler implements HttpRequestHandlerConfig {
  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const _ = context.debugger.child('ProxyHandler -> isMatching()', {method, path});

    _.debug('Looking for public matches');
    context.mapping = RequestUtils.findMapping(
      _,
      getConfig().dynamic.mappings.public,
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
      getConfig().dynamic.mappings.api,
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
      getConfig().dynamic.mappings.pages,
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
    const _ = context.debugger.child('ProxyHandler -> handle()', {method, path, context, headers: req.headers});
    const cookies = RequestUtils.getCookies(req.headers);
    _.debug('-> RequestUtils.getCookies()', { cookies });

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
      metaPayload = <JwtPayload> verify(metaToken, getConfig().dynamic.jwt.metaTokenSecret, {
        complete: false,
      });
      _.debug('Meta cookie found', { metaPayload });
    }

    let breakFlow = await handleHttpAuthenticationFlow(
      _.child('-> handleAuthenticationFlow()'),
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
      _.child('-> handleAuthorizationFlow()'),
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
        if (getConfig().headers.responseConfigVersion) {
          outgoingHeaders[getConfig().headers.responseConfigVersion] = getConfig().dynamic.version.toString();
        }

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

