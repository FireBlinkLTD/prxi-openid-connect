import { HttpMethod, Http2RequestHandlerConfig, ProxyRequest } from "prxi";
import { Context } from "../../../types/Context";
import { getConfig } from "../../../config/getConfig";
import { RequestUtils } from "../../../utils/RequestUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { handleHttp2AuthenticationFlow } from "../../../utils/AccessUtils";
import { sendJsonResponse } from "../../../utils/Http2ResponseUtils";
import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";
import { prepareSetCookies } from "../../../utils/ResponseUtils";
import { Http2BaseAccessHandler } from "./Http2BaseAccessHandler";

export class Http2WhoamiAPIHandler extends Http2BaseAccessHandler {
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
  async process(
    stream: ServerHttp2Stream,
    headers: IncomingHttpHeaders,
    proxyRequest: ProxyRequest,
    method: HttpMethod,
    path: string,
    context: Context,
    cookiesToSet?: Record<string, {value: string, expires?: Date}>
  ) {
    const _ = context.debugger.child('Http2WhoamiAPIHandler -> handle()', { context, headers, method, path });

    const auth = RequestUtils.extractAuthJWTClaims([
      context.accessTokenJWT,
      context.idTokenJWT,
    ], getConfig().dynamic.jwt.authClaimPaths);
    _.debug('-> RequestUtils.extractAuthJWTClaims()', { claims: auth });

    const proxy = RequestUtils.extractRawJWTClaims([
      context.accessTokenJWT,
      context.idTokenJWT,
    ], getConfig().dynamic.jwt.proxyClaimPaths);
    _.debug('-> RequestUtils.extractRawJWTClaims()', { claims: proxy });

    sendJsonResponse(_, 200, {
      anonymous: !context.accessTokenJWT,
      claims: {
        auth,
        proxy,
      },
      meta: context.metaPayload,
    }, stream, {
      'Set-Cookie': prepareSetCookies(cookiesToSet)
    });
  }
}
