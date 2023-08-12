import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { sendErrorResponse } from "../utils/ResponseUtils";
import getLogger from "../Logger";

export const E404Handler: RequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string) => {
    return true;
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: string, path: string) => {
    const logger = getLogger('E404Handler');
    logger.child({ method, path }).error('Request handler not found');
    await sendErrorResponse(req, 404, 'Not found', res);
  }
}
