import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";
import { Http2ErrorHandler } from "prxi";
import getLogger from "../../Logger";
import { getConfig } from "../../config/getConfig";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";

export const http2ErrorHandler: Http2ErrorHandler = async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, err: Error): Promise<void> => {
  console.log(err);
  const logger = getLogger('http2ErrorHandler');
  logger.child({ error: err.message }).error('Unexpected error occurred');

  let code = 500;
  let message = 'Unexpected error occurred';
  let redirectTo = getConfig().redirect.pageRequest.e500;

  if ((<any> err).code === 'ECONNREFUSED') {
    code = 503;
    message = 'Service Unavailable';
    redirectTo = getConfig().redirect.pageRequest.e503;
  }

  if (redirectTo) {
    return sendRedirect(stream, headers, redirectTo);
  }

  await sendErrorResponse(stream, headers, code, message);
}
