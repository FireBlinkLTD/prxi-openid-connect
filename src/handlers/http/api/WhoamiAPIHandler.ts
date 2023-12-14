import { HttpMethod, HttpRequestHandlerConfig, ProxyRequest, Request, Response } from "prxi";
import { Context } from "../../../types/Context";
import { getConfig } from "../../../config/getConfig";
import { RequestUtils } from "../../../utils/RequestUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { handleHttpAuthenticationFlow } from "../../../utils/AccessUtils";
import { sendJsonResponse } from "../../../utils/ResponseUtils";

export class WhoamiAPIHandler implements HttpRequestHandlerConfig {
  /**
   * @inheritdoc
   */
  isMatching(method: HttpMethod, path: string, context: Context): boolean {
    return RequestUtils.isMatching(
      context.debugger.child('WhoamiAPIHandler -> isMatching()', {method, path}),
      // request
      method, path,
      // expected
      'GET', getConfig().paths.api.whoami,
    );
  }

  /**
   * @inheritdoc
   */
  async handle(req: Request, res: Response, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context): Promise<void> {
    context.api = true;

    const _ = context.debugger.child('WhoamiAPIHandler -> handle()', { context, headers: req.headers, method, path });
    const cookies = RequestUtils.getCookies(req.headers);
    _.debug('-> RequestUtils.getCookies()', { cookies });

    let metaPayload: Record<string, any> = null;
    const metaToken = cookies[getConfig().cookies.names.meta];
    if (metaToken) {
      metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
        complete: false,
      });
      _.debug('Meta cookie found', { metaPayload });
    }

    const breakFlow = await handleHttpAuthenticationFlow(
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
    }, res);
  }
}
