import { IncomingHttpHeaders } from "http";
import { ServerHttp2Stream, constants } from "http2";
import getLogger from "../Logger";

const emptyObj = {};

/**
 * Send HTTP/2 redirect response
 * @param stream
 * @param headers
 * @param url
 * @returns
 */
export const sendRedirect = (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, url: string, outgoingHeaders?: Record<string, string | string[]>): void => {
  if (headers['hx-boosted'] === 'true') {
    getLogger('Http2ResponseUtils').child({ url }).debug('HTMX boosted request detected, sending hx-redirect header');
    sendJsonResponse(
      200,
      {
        redirectTo: url,
      },
      stream,
      {
        'hx-redirect': url,
        ...(outgoingHeaders ? outgoingHeaders : emptyObj)
      }
    );
    return;
  }

  stream.respond({
    [constants.HTTP2_HEADER_STATUS]: 307,
    'Location': url,
    ...(outgoingHeaders ? outgoingHeaders : emptyObj)
  })
  stream.end();
}

/**
 * Send error response based on the "Accept" header
 * @param stream
 * @param headers
 * @param statusCode
 * @param message
 * @returns
 */
export const sendErrorResponse = async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, statusCode: number, message: string, responseHeaders?: Record<string, string | string[]>): Promise<void>  => {
  getLogger('Http2ResponseUtils').child({message, statusCode}).debug('Setting error response');
  if (headers.accept === 'application/json') {
    return await sendJsonResponse(statusCode, {
      error: true,
      details: {
        message: message,
        code: statusCode,
      },
    }, stream, responseHeaders);
  }

  await sendResponse(statusCode, 'text/plain', `${statusCode}: ${message}`, stream);
}

/**
 * Send JSON response
 * @param statusCode
 * @param json
 * @param stream
 */
export const sendJsonResponse = async (statusCode: number, json: any, stream: ServerHttp2Stream, headers?: Record<string, string | string[]>): Promise<void> => {
  getLogger('Http2ResponseUtils').debug('Setting JSON response');
  await sendResponse(statusCode, 'application/json', JSON.stringify(json), stream, headers);
}

/**
 * Send response
 * @param statusCode
 * @param contentType
 * @param content
 * @param resp
 */
const sendResponse = async (statusCode: number, contentType: string, content: any, stream: ServerHttp2Stream, headers?: Record<string, string | string[]>): Promise<void> => {
  getLogger('Http2ResponseUtils').debug('Setting response');
  stream.respond({
    [constants.HTTP2_HEADER_STATUS]: statusCode,
    'content-type': contentType,
    ...headers,
  })

  stream.write(content);
  stream.end();
  return;
}





