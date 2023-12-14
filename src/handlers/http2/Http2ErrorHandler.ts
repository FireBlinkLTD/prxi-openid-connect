import { IncomingHttpHeaders, ServerHttp2Stream } from "node:http2";
import { Http2ErrorHandler } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";
import { Context } from "../../types/Context";

export const http2ErrorHandler: Http2ErrorHandler = async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error, context: Context): Promise<void> => {
  const _ = context.debugger.child('http2ErrorHandler');

  console.log(err);
  _.error('Unexpected error occurred', err);

  let code = 500;
  let message = 'Unexpected error occurred';
  let redirectTo = getConfig().redirect.pageRequest.e500;

  if ((<any> err).code === 'ECONNREFUSED') {
    code = 503;
    message = 'Service Unavailable';
    redirectTo = getConfig().redirect.pageRequest.e503;
  }

  if (redirectTo) {
    return sendRedirect(_, stream, headers, redirectTo);
  }

  await sendErrorResponse(_, stream, headers, code, message);
}
