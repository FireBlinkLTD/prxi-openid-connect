import { ProxyRequest, Http2RequestHandlerConfig, HttpMethod } from "prxi";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";
import getLogger from "../../Logger";
import { getConfig } from "../../config/getConfig";
import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";
import { Context } from "../../types/Context";

export const Http2E404Handler: Http2RequestHandlerConfig = {
  isMatching: () => {
    return true;
  },

  handle: async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) => {
    const debug = context.debugger.child('Http2E404Handler -> handle', {method, path});
    const logger = getLogger('Http2E404Handler');
    logger.child({ method, path }).error('Request handler not found');

    if (getConfig().redirect.pageRequest.e404) {
      debug.event('Send redirect to custom 404 page', {
        redirectTo: getConfig().redirect.pageRequest.e404,
      });
      return sendRedirect(stream, headers, getConfig().redirect.pageRequest.e404);
    }

    debug.event('Send 404 error response');
    await sendErrorResponse(stream, headers, 404, 'Not found');
  }
}
