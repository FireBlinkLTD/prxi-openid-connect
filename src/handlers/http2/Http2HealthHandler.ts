import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendJsonResponse } from "../../utils/Http2ResponseUtils";
import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";
import { Context } from "../../types/Context";

export const Http2HealthHandler: Http2RequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string, context: Context) => {
    const _ = context.debugger.child('Http2HealthHandler -> isMatching');
    const matching = method === 'GET' && path === getConfig().healthPath;
    _.debug('Matching', { matching });

    return matching;
  },

  handle: async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) => {
    const _ = context.debugger.child('Http2HealthHandler -> handle');
    await sendJsonResponse(_, 200, {success: true}, stream);
  }
}
