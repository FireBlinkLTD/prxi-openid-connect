import { IncomingMessage, ServerResponse } from "node:http";
import { ProxyRequest, HttpRequestHandlerConfig } from "prxi";
import { sendErrorResponse, sendRedirect } from "../../utils/ResponseUtils";
import { getConfig } from "../../config/getConfig";
import { Context } from "../../types/Context";

export const E404Handler: HttpRequestHandlerConfig = {
  /**
   * @inheritdoc
   */
  isMatching() {
    return true;
  },

  /**
   * @inheritdoc
   */
  async handle(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: string, path: string, context: Context) {
    const _ = context.debugger.child('E404Handler -> handle()', {method, path});
    _.info('Request handler not found', { method, path });

    if (getConfig().redirect.pageRequest.e404) {
      sendRedirect(_, req, res, getConfig().redirect.pageRequest.e404);
      return;
    }

    await sendErrorResponse(_, req, 404, 'Not found', res);
  }
}
