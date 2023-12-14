import { Request, Response } from "prxi";
import { getConfig } from "../config/getConfig";
import { serialize } from "cookie";
import { TokenSet } from "openid-client";
import getLogger from "../Logger";
import { Debugger } from "./Debugger";

let domain: string;

/**
 * Get domain name for the current hostURL configuration setting
 * @returns
 */
export const getDomain = (): string => {
  if (!domain) {
    domain = new URL(getConfig().hostURL).hostname;
  }

  return domain;
}

/**
 * Invalidate auth cookies
 * @param resp
 * @param override
 */
export const invalidateAuthCookies = (resp: Response, override?: Record<string, { value: string, expires?: Date }>): void => {
  const accessCookies = prepareInvalidatedAuthCookies(override);
  setCookies(resp, accessCookies);
}

/**
 * Prepare invalidate auth cookies
 * @param resp
 * @param override
 */
export const prepareInvalidatedAuthCookies = (override?: Record<string, { value: string, expires?: Date }>): Record<string, { value: string, expires?: Date }> => {
  getLogger('ResponseUtils').debug('Prepare invalidate auth cookies');

  let accessCookies: Record<string, { value: string, expires?: Date }> = {
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
    [getConfig().cookies.names.meta]: {
      value: 'n/a',
      expires: new Date(0),
    },
  };

  if (override) {
    accessCookies = {
      ...accessCookies,
      ...override,
    }
  }

  return accessCookies;
}

/**
 * Set Auth Cookies
 * @param resp
 * @param tokens
 */
export const setAuthCookies = (resp: Response, tokens: TokenSet, metaToken?: string): void => {
  const accessCookies = prepareAuthCookies(tokens, metaToken);
  setCookies(resp, accessCookies);
}

/**
 * Prepare Auth Cookies
 * @param resp
 * @param tokens
 */
export const prepareAuthCookies = (tokens: TokenSet, metaToken?: string): Record<string, { value: string, expires?: Date }> => {
  getLogger('ResponseUtils').debug('Preparing auth cookies');
  const accessCookies: Record<string, { value: string, expires?: Date }> = {
    [getConfig().cookies.names.originalPath]: {
      value: 'n/a',
      expires: new Date(0),
    }
  };

  /* istanbul ignore else */
  if (tokens.access_token) {
    accessCookies[getConfig().cookies.names.accessToken] = {
      value: tokens.access_token,
      expires: new Date(tokens.expires_at * 1000),
    }
  }

  /* istanbul ignore else */
  if (tokens.id_token) {
    accessCookies[getConfig().cookies.names.idToken] = {
      value: tokens.id_token,
      expires: new Date(tokens.expires_at * 1000),
    }
  }

  /* istanbul ignore else */
  if (tokens.refresh_token) {
    accessCookies[getConfig().cookies.names.refreshToken] = {
      value: tokens.refresh_token,
    }
  }

  if (metaToken) {
    accessCookies[getConfig().cookies.names.meta] = {
      value: metaToken
    }
  }

  return accessCookies;
}

/**
 * Set cookies
 * @param resp
 * @param cookies
 */
const setCookies = (resp: Response, cookies: Record<string, {value: string, expires?: Date}>): void => {
  const setCookies = prepareSetCookies(cookies);
  resp.setHeader('Set-Cookie', setCookies);
}

/**
 * Send redirect response
 * @param _
 * @param req
 * @param resp
 * @param url
 * @returns
 */
export const sendRedirect = async (_: Debugger, req: Request, resp: Response, url: string): Promise<void> => {
  _.debug('Sending redirect', {
    redirectTo: url,
    outgoingHeaders: resp.getHeaders(),
  });

  if (req.headers['hx-boosted'] === 'true') {
    _.debug('HTMX boosted request detected, sending hx-redirect header', { url });
    resp.setHeader('hx-redirect', url);
    await sendJsonResponse(_, 200, {
      redirectTo: url
    }, resp);

    return;
  }

  resp.statusCode = 307;
  resp.setHeader('Location', url);
  resp.end();
}

/**
 * Send error response based on the "Accept" header
 * @param _
 * @param req
 * @param statusCode
 * @param message
 * @param resp
 */
export const sendErrorResponse = async (_: Debugger, req: Request, statusCode: number, message: string, resp: Response): Promise<void>  => {
  _.debug('Sending error response', {message, statusCode, responseHeaders: resp.getHeaders()});
  if (req.headers.accept === 'application/json') {
    return await sendJsonResponse(_, statusCode, {
      error: true,
      details: {
        message: message,
        code: statusCode,
      },
    }, resp);
  }

  await sendResponse(_, statusCode, 'text/plain', `${statusCode}: ${message}`, resp);
}

/**
 * Send JSON response
 * @parma _
 * @param statusCode
 * @param json
 * @param resp
 */
export const sendJsonResponse = async (_: Debugger, statusCode: number, json: any, resp: Response): Promise<void> => {
  _.debug('Sending JSON response');
  await sendResponse(_, statusCode, 'application/json', JSON.stringify(json), resp);
}

/**
 * Send response
 * @param _
 * @param statusCode
 * @param contentType
 * @param content
 * @param resp
 */
const sendResponse = async (_: Debugger, statusCode: number, contentType: string, content: any, resp: Response): Promise<void> => {
  _.debug('Sending response', { content, statusCode, headers: resp.getHeaders(), contentType });
  resp.statusCode = statusCode;
  resp.setHeader('content-type', contentType);

  await new Promise<void>((res, rej) => {
    resp.write(content, (error: Error) => {
      resp.end();

      /* istanbul ignore next */
      if (error) {
        return rej(error);
      }
      res();
    });
  })
}

/**
 * Prepare Set-Cookie header value
 * @param resp
 * @param cookies
 */
export const prepareSetCookies = (cookies: Record<string, {value: string, expires?: Date}>): string[] => {
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
  return setCookies;
}
