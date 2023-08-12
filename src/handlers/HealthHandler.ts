import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { getConfig } from "../ServerConfig";
import { sendJsonResponse } from "../utils/ResponseUtils";

export const HealthHandler: RequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string) => {
    return method === 'GET' && path === getConfig().healthPath;
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest) => {
    await sendJsonResponse(200, {success: true}, res);
  }
}
