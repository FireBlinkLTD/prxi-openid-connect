import { IncomingMessage, ServerResponse } from "http";
import { ProxyRequest, HttpRequestHandlerConfig } from "prxi";
import { sendErrorResponse, sendRedirect } from "../../utils/ResponseUtils";
import getLogger from "../../Logger";
import { getConfig } from "../../config/getConfig";

export const E404Handler: HttpRequestHandlerConfig = {
  isMatching: () => {
    return true;
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: string, path: string) => {
    const logger = getLogger('E404Handler');
    logger.child({ method, path }).error('Request handler not found');

    if (getConfig().redirect.pageRequest.e404) {
      sendRedirect(req, res, getConfig().redirect.pageRequest.e404);
      return;
    }

    await sendErrorResponse(req, 404, 'Not found', res);
  }
}
