import { HttpMethod, Http2RequestHandlerConfig, ProxyRequest } from "prxi";
import { Context } from "../../../types/Context";
import { getConfig } from "../../../config/getConfig";
import { RequestUtils } from "../../../utils/RequestUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { handleHttp2AuthenticationFlow } from "../../../utils/AccessUtils";
import { sendJsonResponse } from "../../../utils/Http2ResponseUtils";
import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";
import { prepareSetCookies } from "../../../utils/ResponseUtils";

export class Http2WhoamiAPIHandler implements Http2RequestHandlerConfig {
  /**
   * @inheritdoc
   */
  isMatching(method: HttpMethod, path: string, context: Context): boolean {
    return RequestUtils.isMatching(
      context.debugger.child('Http2WhoamiAPIHandler -> isMatching()', {method, path}),
      // request
      method, path,
      // expected
      'GET', getConfig().paths.api.whoami,
    );
  }

  /**
   * @inheritdoc
   */
  async handle(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    context.api = true;

    const _ = context.debugger.child('Http2WhoamiAPIHandler -> handle()', { context, headers, method, path });
    const cookies = RequestUtils.getCookies(headers);
    _.debug('-> RequestUtils.getCookies()', { cookies });

    let metaPayload: Record<string, any> = null;
    const metaToken = cookies[getConfig().cookies.names.meta];
    if (metaToken) {
      metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
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

    const auth = RequestUtils.extractAuthJWTClaims([
      context.accessTokenJWT,
      context.idTokenJWT,
    ], getConfig().jwt.authClaimPaths);
    _.debug('-> RequestUtils.extractAuthJWTClaims()', { claims: auth });

    const proxy = RequestUtils.extractRawJWTClaims([
      context.accessTokenJWT,
      context.idTokenJWT,
    ], getConfig().jwt.proxyClaimPaths);
    _.debug('-> RequestUtils.extractRawJWTClaims()', { claims: proxy });

    sendJsonResponse(_, 200, {
      anonymous: !context.accessTokenJWT,
      claims: {
        auth,
        proxy,
      },
      meta: metaPayload?.p,
    }, stream, {
      'Set-Cookie': prepareSetCookies(cookiesToSet)
    });
  }
}
