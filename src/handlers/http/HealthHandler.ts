import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendJsonResponse } from "../../utils/ResponseUtils";

export const HealthHandler: HttpRequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string) => {
    return method === 'GET' && path === getConfig().healthPath;
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest) => {
    await sendJsonResponse(200, {success: true}, res);
  }
}
