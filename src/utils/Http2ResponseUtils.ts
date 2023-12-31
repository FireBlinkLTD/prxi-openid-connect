import { IncomingHttpHeaders } from "node:http";
import { ServerHttp2Stream, constants } from "node:http2";
import { Debugger } from "./Debugger";
import { getConfig } from "../config/getConfig";

const emptyObj = {};

/**
 * Send HTTP/2 redirect response
 * @param _
 * @param stream
 * @param headers
 * @param url
 * @returns
 */
export const sendRedirect = (_: Debugger, stream: ServerHttp2Stream, headers: IncomingHttpHeaders, url: string, outgoingHeaders?: Record<string, string | string[]>): void => {
  _.debug('Sending redirect', {
    redirectTo: url,
    outgoingHeaders,
  });

  if (headers['hx-boosted'] === 'true') {
    _.debug('HTMX boosted request detected, sending hx-redirect header', { url });
    sendJsonResponse(
      _,
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
 * @param _
 * @param stream
 * @param headers
 * @param statusCode
 * @param message
 * @returns
 */
export const sendErrorResponse = async (_: Debugger, stream: ServerHttp2Stream, headers: IncomingHttpHeaders, statusCode: number, message: string, responseHeaders?: Record<string, string | string[]>): Promise<void>  => {
  _.debug('Sending error response', {message, statusCode, responseHeaders});
  if (headers.accept === 'application/json') {
    return await sendJsonResponse(_, statusCode, {
      error: true,
      details: {
        message: message,
        code: statusCode,
      },
    }, stream, responseHeaders);
  }

  await sendResponse(_, statusCode, 'text/plain', `${statusCode}: ${message}`, stream, responseHeaders);
}

/**
 * Send JSON response
 * @param _
 * @param statusCode
 * @param json
 * @param stream
 */
export const sendJsonResponse = async (_: Debugger, statusCode: number, json: any, stream: ServerHttp2Stream, headers?: Record<string, string | string[]>): Promise<void> => {
  if (getConfig().headers.responseConfigVersion) {
    headers[getConfig().headers.responseConfigVersion] = getConfig().dynamic.version.toString();
  }

  _.debug('Sending JSON response', { json });
  await sendResponse(_, statusCode, 'application/json', JSON.stringify(json), stream, headers);
}

/**
 * Send response
 * @param statusCode
 * @param contentType
 * @param content
 * @param resp
 */
const sendResponse = async (_: Debugger, statusCode: number, contentType: string, content: any, stream: ServerHttp2Stream, headers?: Record<string, string | string[]>): Promise<void> => {
  _.debug('Sending response', { content, statusCode, headers, contentType });
  stream.respond({
    [constants.HTTP2_HEADER_STATUS]: statusCode,
    'content-type': contentType,
    ...headers,
  })

  stream.write(content);
  stream.end();
  return;
}

