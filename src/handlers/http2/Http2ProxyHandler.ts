import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig, Response } from "prxi";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";
import { getConfig } from "../../config/getConfig";
import { JwtPayload, verify } from "jsonwebtoken";
import { RequestUtils } from "../../utils/RequestUtils";
import { IncomingHttpHeaders, OutgoingHttpHeaders, ServerHttp2Stream } from "node:http2";
import { prepareSetCookies } from "../../utils/ResponseUtils";
import { Debugger } from "../../utils/Debugger";
import { Context } from "../../types/Context";
import { handleHttp2AuthenticationFlow } from "../../utils/AccessUtils";

export class Http2ProxyHandler implements Http2RequestHandlerConfig {
  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const _ = context.debugger.child('Http2ProxyHandler -> isMatching()', { method, path });

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
      _.debug('Handling API mapping');
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

    _.debug('No mappings found');
    return false
  }

  /**
   * @inheritdoc
   */
  async handle(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    const _ = context.debugger.child('Http2ProxyHandler -> handle()', { context, headers, method, path });
    const cookies = RequestUtils.getCookies(headers);
    _.debug('-> RequestUtils.getCookies()', { cookies });

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
      metaPayload = <JwtPayload> verify(metaToken, getConfig().dynamic.jwt.metaTokenSecret, {
        complete: false,
      });
      _.debug('Meta cookie found', { metaPayload });
    }

    let { reject: breakFlow, cookiesToSet} = await handleHttp2AuthenticationFlow(
      _.child('-> handleAuthenticationFlow()'),
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
      _.child('-> handleAuthorizationFlow()'),
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
        if (getConfig().headers.responseConfigVersion) {
          outgoingHeaders[getConfig().headers.responseConfigVersion] = getConfig().dynamic.version.toString();
        }

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
        sendRedirect(_, stream, headers, getConfig().redirect.pageRequest.e403);
      } else {
        sendErrorResponse(_, stream, headers, 403, 'Forbidden');
      }

      return true;
    }

    context.claims = claims;
    _.debug('Access allowed', { context });

    return false;
  }
}

