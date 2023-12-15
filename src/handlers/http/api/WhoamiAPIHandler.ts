import { HttpMethod, ProxyRequest, Request, Response } from "prxi";
import { Context } from "../../../types/Context";
import { getConfig } from "../../../config/getConfig";
import { RequestUtils } from "../../../utils/RequestUtils";
import { sendJsonResponse } from "../../../utils/ResponseUtils";
import { BaseAccessHandler } from "./BaseAccessHandler";

export class WhoamiAPIHandler extends BaseAccessHandler {
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
  async process(req: Request, res: Response, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context): Promise<void> {
    const _ = context.debugger.child('WhoamiAPIHandler -> process()', { context, headers: req.headers, method, path });

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
      meta: context.metaPayload
    }, res);
  }
}
