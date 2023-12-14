import { IncomingMessage, ServerResponse } from "node:http";
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendJsonResponse } from "../../utils/ResponseUtils";
import { Context } from "../../types/Context";
import { RequestUtils } from "../../utils/RequestUtils";

export const HealthHandler: HttpRequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string, context: Context) => {
    return RequestUtils.isMatching(
      context.debugger.child('HealthHandler -> isMatching()', {method, path}),
      // request
      method, path,
      // expected
      'GET', getConfig().paths.health,
    );
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) => {
    const _ = context.debugger.child('HealthHandler -> handle()');
    await sendJsonResponse(_, 200, {success: true}, res);
  }
}
