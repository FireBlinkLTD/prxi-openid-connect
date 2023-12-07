import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendJsonResponse } from "../../utils/Http2ResponseUtils";
import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";

export const Http2HealthHandler: Http2RequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string) => {
    return method === 'GET' && path === getConfig().healthPath;
  },

  handle: async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest) => {
    await sendJsonResponse(200, {success: true}, stream);
  }
}
