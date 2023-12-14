import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendJsonResponse } from "../../utils/Http2ResponseUtils";
import { IncomingHttpHeaders, ServerHttp2Stream } from "node:http2";
import { Context } from "../../types/Context";
import { RequestUtils } from "../../utils/RequestUtils";

export const Http2HealthHandler: Http2RequestHandlerConfig = {
  /**
   * @inheritdoc
   */
  isMatching: (method: HttpMethod, path: string, context: Context) => {
    return RequestUtils.isMatching(
      context.debugger.child('HealthHandler -> isMatching()', {method, path}),
      // request
      method, path,
      // expected
      'GET', getConfig().paths.health,
    );
  },

  /**
   * @inheritdoc
   */
  handle: async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) => {
    const _ = context.debugger.child('Http2HealthHandler -> handle()');
    await sendJsonResponse(_, 200, {success: true}, stream);
  }
}
