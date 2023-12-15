import { HttpMethod, HttpRequestHandlerConfig, ProxyRequest, Request, Response } from "prxi";
import { Context } from "../../../types/Context";
import { getConfig } from "../../../config/getConfig";
import { RequestUtils } from "../../../utils/RequestUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { handleHttpAuthenticationFlow } from "../../../utils/AccessUtils";

export abstract class BaseAccessHandler implements HttpRequestHandlerConfig {
  /**
   * @inheritdoc
   */
  abstract isMatching(method: HttpMethod, path: string, context: Context): boolean;

  /**
   * @inheritdoc
   */
  async handle(req: Request, res: Response, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context): Promise<void> {
    context.api = true;

    const _ = context.debugger.child('BaseAccessHandler -> handle()', { context, headers: req.headers, method, path });
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
    context.metaPayload = metaPayload?.p;

    const breakFlow = await handleHttpAuthenticationFlow(
      _.child('-> handleAuthenticationFlow()'),
      cookies,
      req,
      res,
      method,
      path,
      context,
      metaPayload
    );
    if (breakFlow) {
      _.debug('Breaking upon authentication');
      return;
    }

    await this.process(req, res, proxyRequest, method, path, context);
  }

  /**
   * Called after handle()
   * @param req
   * @param res
   * @param proxyRequest
   * @param method
   * @param path
   * @param context
   */
  abstract process(req: Request, res: Response, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context): Promise<void>;
}
