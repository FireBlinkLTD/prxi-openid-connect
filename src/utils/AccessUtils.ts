import { Request, Response } from "prxi";
import { getConfig } from "../config/getConfig";
import { Context } from "../types/Context";
import { Debugger } from "./Debugger";
import { JWTVerificationResult, OpenIDUtils } from "./OpenIDUtils";
import * as HttpResponseUtils from "./ResponseUtils";
import * as Http2ResponseUtils from "./Http2ResponseUtils";
import { IncomingHttpHeaders, ServerHttp2Stream, constants } from "http2";

/**
 * Handle HTTP/1.1 authentication flow
 * @param _
 * @param cookies
 * @param req
 * @param res
 * @param method
 * @param path
 * @param context
 * @returns
 */
export const handleHttpAuthenticationFlow = async(
  _: Debugger,
  cookies: Record<string, string>,
  req: Request,
  res: Response,
  method: string,
  path: string,
  context: Context,
  metaPayload: Record<string, any>,
): Promise<boolean> => {
  _.debug('Handling authentication flow', {
    cookies,
    path,
    method,
    context
  });

  let accessToken = context.accessToken = cookies[getConfig().cookies.names.accessToken];
  let idToken = context.idToken = cookies[getConfig().cookies.names.idToken];
  let refreshToken = context.refreshToken = cookies[getConfig().cookies.names.refreshToken];

  let { jwt: accessTokenJWT, verificationResult: accessTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(accessToken);
  let { jwt: idTokenJWT, verificationResult: idTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(idToken);

  context.accessTokenJWT = accessTokenJWT;
  context.idTokenJWT = idTokenJWT;

  // if access token is missing or expired attempt to refresh tokens
  if(
    refreshToken &&
    (
      accessTokenVerificationResult === JWTVerificationResult.MISSING ||
      accessTokenVerificationResult === JWTVerificationResult.EXPIRED ||
      idTokenVerificationResult === JWTVerificationResult.EXPIRED
    )
  ) {
    try {
      _.debug('Refreshing token', { refreshToken, accessTokenVerificationResult, idTokenVerificationResult });
      const tokens = await OpenIDUtils.refreshTokens(refreshToken);
      _.debug('-> OpenIDUtils.refreshTokens()', { tokens });

      let metaToken;
      if (metaPayload) {
        metaToken = OpenIDUtils.prepareMetaToken(metaPayload);
        _.debug('Meta token prepared', { metaToken });
      }

      HttpResponseUtils.setAuthCookies(res, tokens, metaToken);

      accessToken = context.accessToken = tokens.access_token;
      idToken = context.idToken = tokens.id_token;
      refreshToken = context.refreshToken = tokens.refresh_token;

      const accessVerification = await OpenIDUtils.parseTokenAndVerify(accessToken);
      const idVerification = await OpenIDUtils.parseTokenAndVerify(idToken);
      accessTokenVerificationResult = accessVerification.verificationResult;

      context.accessTokenJWT = accessVerification.jwt;
      context.idTokenJWT = idVerification.jwt;
    } catch (e) {
      _.error(`Unable to refresh token`, e);

      accessToken = context.accessToken = null;
      idToken = context.idToken = null;
      refreshToken = context.refreshToken = null;

      accessTokenVerificationResult = JWTVerificationResult.MISSING;
    }
  }

  if (accessTokenVerificationResult === JWTVerificationResult.MISSING) {
    _.debug('Access token is missing');
    if (context.page) {
      let query = '';
      let queryIdx = req.url.indexOf('?');
      if (queryIdx >= 0) {
        query = req.url.substring(queryIdx);
      }

      _.debug('Invalidating auth cookies, keeping original path', {
        value: path + query,
      });
      HttpResponseUtils.invalidateAuthCookies(res, {
        [getConfig().cookies.names.originalPath]: {
          value: path + query,
          expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        }
      });
    } else {
      _.debug('Invalidating auth cookies');
      HttpResponseUtils.invalidateAuthCookies(res);
    }

    if (context.mapping && context.mapping.auth.required) {
      if (context.page) {
        await HttpResponseUtils.sendRedirect(_, req, res, OpenIDUtils.getAuthorizationUrl());
      } else {
        await HttpResponseUtils.sendErrorResponse(_, req, 401, 'Unauthorized', res);
      }

      _.debug('Access token is missing but mapping requires auth');
      return true;
    } else {
      _.debug('Access token is missing and auth isn\'t required');
      delete context.idTokenJWT;
      delete context.accessTokenJWT;
    }
  } else if (accessTokenVerificationResult !== JWTVerificationResult.SUCCESS) {
    _.debug('Access token verification failed', {
      accessTokenVerificationResult,
    });

    HttpResponseUtils.invalidateAuthCookies(res);

    if (context.page) {
      await HttpResponseUtils.sendRedirect(_, req, res, OpenIDUtils.getAuthorizationUrl());
    } else {
      HttpResponseUtils.sendErrorResponse(_, req, 401, 'Unauthorized', res);
    }

    _.debug('Access token is invalid but mapping requires auth');
    return true;
  }

  _.debug('Authentication flow passes');
  return false;
}

/**
 * Handle HTTP/2 authentication flow
 * @param debug
 * @param stream
 * @param headers
 * @param cookies
 * @param method
 * @param path
 * @param context
 * @param metaPayload
 * @returns
 */
export const handleHttp2AuthenticationFlow = async (
  _: Debugger,
  stream: ServerHttp2Stream,
  headers: IncomingHttpHeaders,
  cookies: Record<string, string>,
  method: string,
  path: string,
  context: Context,
  metaPayload: Record<string, any>
): Promise<{
  reject: boolean,
  cookiesToSet?: Record<string, {value: string, expires?: Date}>,
}> => {
  _.debug('Handling authentication flow', {
    cookies,
    path,
    method,
    context,
    headers
  })

  let cookiesToSet = {};
  let accessToken = context.accessToken = cookies[getConfig().cookies.names.accessToken];
  let idToken = context.idToken = cookies[getConfig().cookies.names.idToken];
  let refreshToken = context.refreshToken = cookies[getConfig().cookies.names.refreshToken];

  let { jwt: accessTokenJWT, verificationResult: accessTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(accessToken);
  let { jwt: idTokenJWT, verificationResult: idTokenVerificationResult } = await OpenIDUtils.parseTokenAndVerify(idToken);

  context.accessTokenJWT = accessTokenJWT;
  context.idTokenJWT = idTokenJWT;

  // if access token is missing or expired attempt to refresh tokens
  if(
    refreshToken &&
    (
      accessTokenVerificationResult === JWTVerificationResult.MISSING ||
      accessTokenVerificationResult === JWTVerificationResult.EXPIRED ||
      idTokenVerificationResult === JWTVerificationResult.EXPIRED
    )
  ) {
    try {
      _.debug('Refreshing token', { refreshToken, accessTokenVerificationResult, idTokenVerificationResult });
      const tokens = await OpenIDUtils.refreshTokens(refreshToken);
      _.debug('-> OpenIDUtils.refreshTokens()', { tokens });

      let metaToken;
      if (metaPayload) {
        metaToken = OpenIDUtils.prepareMetaToken(metaPayload);
        _.debug('Meta token prepared', { metaToken });
      }

      cookiesToSet = HttpResponseUtils.prepareAuthCookies(tokens, metaToken);

      accessToken = context.accessToken = tokens.access_token;
      idToken = context.idToken = tokens.id_token;
      refreshToken = context.refreshToken = tokens.refresh_token;

      const accessVerification = await OpenIDUtils.parseTokenAndVerify(accessToken);
      const idVerification = await OpenIDUtils.parseTokenAndVerify(idToken);
      accessTokenVerificationResult = accessVerification.verificationResult;

      context.accessTokenJWT = accessVerification.jwt;
      context.idTokenJWT = idVerification.jwt;
    } catch (e) {
      _.error(`Unable to refresh token`, e);

      accessToken = context.accessToken = null;
      idToken = context.idToken = null;
      refreshToken = context.refreshToken = null;

      accessTokenVerificationResult = JWTVerificationResult.MISSING;
    }
  }

  if (accessTokenVerificationResult === JWTVerificationResult.MISSING) {
    _.debug('Access token is missing');
    if (context.page) {
      let query = '';
      let queryIdx = headers[constants.HTTP2_HEADER_PATH].indexOf('?');
      if (queryIdx >= 0) {
        query = headers[constants.HTTP2_HEADER_PATH].toString().substring(queryIdx);
      }

      _.debug('Preparing auth cookies to be invalidated, keeping original path', {
        value: path + query,
      });
      cookiesToSet = HttpResponseUtils.prepareInvalidatedAuthCookies({
        [getConfig().cookies.names.originalPath]: {
          value: path + query,
          expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        }
      })
    } else {
      _.debug('Preparing auth cookies to be invalidated');
      cookiesToSet = HttpResponseUtils.prepareInvalidatedAuthCookies();
    }

    if (context.mapping && context.mapping.auth.required) {
      if (context.page) {
        Http2ResponseUtils.sendRedirect(_, stream, headers, OpenIDUtils.getAuthorizationUrl(), {
          'Set-Cookie': HttpResponseUtils.prepareSetCookies(cookiesToSet),
        });
      } else {
        Http2ResponseUtils.sendErrorResponse(_, stream, headers, 401, 'Unauthorized', {
          'Set-Cookie': HttpResponseUtils.prepareSetCookies(cookiesToSet),
        });
      }

      _.debug('Access token is missing but mapping requires auth');
      return {
        reject: true
      };
    } else {
      _.debug('Access token is missing and auth isn\'t required');
      delete context.idTokenJWT;
      delete context.accessTokenJWT;
    }
  } else if (accessTokenVerificationResult !== JWTVerificationResult.SUCCESS) {
    _.debug('Access token verification failed', {
      accessTokenVerificationResult,
    });

    const cookiesToSet = HttpResponseUtils.prepareSetCookies(HttpResponseUtils.prepareInvalidatedAuthCookies());
    if (context.page) {
      Http2ResponseUtils.sendRedirect(_, stream, headers, OpenIDUtils.getAuthorizationUrl(), {
        'Set-Cookie': cookiesToSet,
      });
    } else {
      Http2ResponseUtils.sendErrorResponse(_, stream, headers, 401, 'Unauthorized', {
        'Set-Cookie': cookiesToSet,
      });
    }

    _.debug('Access token is invalid but mapping requires auth');
    return {
      reject: true
    };
  }

  _.debug('Authentication flow passes', { cookiesToSet });
  return {
    reject: false,
    cookiesToSet,
  };
}
