import { IncomingMessage, ServerResponse } from "http"
import { getConfig } from "../ServerConfig";
import { serialize } from "cookie";
import { TokenSet } from "openid-client";

let domain: string;

/**
 * Get domain name for the current hostURL configuration setting
 * @returns
 */
const getDomain = (): string => {
  if (domain) {
    domain = new URL(getConfig().hostURL).hostname;
  }

  return domain;
}

/**
 * Invalidate auth cookies
 * @param resp
 */
export const invalidateAuthCookies = (resp: ServerResponse): void => {
  const accessCookies: Record<string, { value: string, expires?: Date }> = {
    [getConfig().cookies.names.originalPath]: {
      value: 'n/a',
      expires: new Date(0),
    },
    [getConfig().cookies.names.accessToken]: {
      value: 'n/a',
      expires: new Date(0),
    },
    [getConfig().cookies.names.idToken]: {
      value: 'n/a',
      expires: new Date(0),
    },
    [getConfig().cookies.names.refreshToken]: {
      value: 'n/a',
      expires: new Date(0),
    },
  };
}

/**
 * Set Auth Cookies
 * @param resp
 * @param tokens
 */
export const setAuthCookies = (resp: ServerResponse, tokens: TokenSet): void => {
  const accessCookies: Record<string, { value: string, expires?: Date }> = {
    [getConfig().cookies.names.originalPath]: {
      value: 'n/a',
      expires: new Date(0),
    }
  };

  if (tokens.access_token) {
    accessCookies[getConfig().cookies.names.accessToken] = {
      value: tokens.access_token,
      expires: new Date(tokens.expires_at * 1000),
    }
  }

  if (tokens.id_token) {
    accessCookies[getConfig().cookies.names.idToken] = {
      value: tokens.id_token,
      expires: new Date(tokens.expires_at * 1000),
    }
  }

  if (tokens.refresh_token) {
    accessCookies[getConfig().cookies.names.refreshToken] = {
      value: tokens.refresh_token,
    }
  }

  setCookies(resp, accessCookies);
}

/**
 * Set cookies
 * @param resp
 * @param cookies
 */
export const setCookies = (resp: ServerResponse, cookies: Record<string, {value: string, expires?: Date}>): void => {
  const setCookies = [];
  for (const name of Object.keys(cookies)) {
    setCookies.push(serialize(name, cookies[name].value, {
        secure: getConfig().cookies.secure,
        expires: cookies[name].expires,
        sameSite: 'lax',
        domain: getDomain(),
        path: '/',
    }));
  }

  resp.setHeader('Set-Cookie', setCookies);
}

/**
 * Send redirect
 * @param resp
 * @param url
 */
export const sendRedirect = async (resp: ServerResponse, url: string): Promise<void> => {
  resp.statusCode = 307;
  resp.setHeader('Location', url);
  resp.end();
}

/**
 * Send error response based on the "Accept" header
 * @param req
 * @param statusCode
 * @param message
 * @param resp
 */
export const sendErrorResponse = async (req: IncomingMessage, statusCode: number, message: string, resp: ServerResponse): Promise<void>  => {
  if (req.headers.accept === 'application/json') {
    return await sendJsonResponse(statusCode, {
      error: true,
      details: {
        errorMessage: message,
        statusCode: statusCode,
      },
    }, resp);
  }

  await sendResponse(statusCode, 'text/plain', `${statusCode}: ${message}`, resp);
}

/**
 * Send JSON response
 * @param statusCode
 * @param json
 * @param resp
 */
export const sendJsonResponse = async (statusCode: number, json: any, resp: ServerResponse): Promise<void> => {
  await sendResponse(statusCode, 'application/json', JSON.stringify(json), resp);
}

/**
 * Send response
 * @param statusCode
 * @param contentType
 * @param content
 * @param resp
 */
export const sendResponse = async (statusCode: number, contentType: string, content: any, resp: ServerResponse): Promise<void> => {
  resp.statusCode = statusCode;
  resp.setHeader('content-type', contentType);

  await new Promise<void>((res, rej) => {
    resp.write(content, (error: Error) => {
      resp.end();

      if (error) {
        return rej(error);
      }
      res();
    });
  })
}
