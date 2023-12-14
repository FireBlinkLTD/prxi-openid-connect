import { ProxyRequest, Http2RequestHandlerConfig, HttpMethod } from "prxi";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";
import { getConfig } from "../../config/getConfig";
import { IncomingHttpHeaders, ServerHttp2Stream } from "node:http2";
import { Context } from "../../types/Context";

export const Http2E404Handler: Http2RequestHandlerConfig = {
  isMatching: () => {
    return true;
  },

  handle: async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) => {
    const _ = context.debugger.child('Http2E404Handler -> handle()', {method, path});
    _.info('Request handler not found', { method, path });

    if (getConfig().redirect.pageRequest.e404) {
      return sendRedirect(_, stream, headers, getConfig().redirect.pageRequest.e404);
    }

    await sendErrorResponse(_, stream, headers, 404, 'Not found');
  }
}
