import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";
import { OpenIDUtils } from "../../utils/OpenIDUtils";
import getLogger from "../../Logger";
import { RequestUtils } from "../../utils/RequestUtils";
import { ServerHttp2Stream, constants } from "http2";
import { IncomingHttpHeaders, IncomingMessage } from "http";
import { prepareAuthCookies, prepareSetCookies } from "../../utils/ResponseUtils";
import { Context } from "../../types/Context";

export const Http2CallbackHandler: Http2RequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string, context: Context) => {
    const debug = context.debugger.child('Http2CallbackHandler -> isMatching', {method, path});
    const match = method === 'GET' && path === getConfig().openid.callbackPath;
    debug.event('Match check result', {match})

    return match;
  },

  handle: async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) => {
    const logger = getLogger('Http2CallbackHandler');
    const debug = context.debugger.child('Http2CallbackHandler -> handle', {method, path});

    let tokens = await OpenIDUtils.exchangeCode({
      url: headers[constants.HTTP2_HEADER_PATH].toString(),
      method: method.toString(),
    });
    debug.event('-> OpenIDUtils.exchangeCode()', { tokens });
    let metaToken: string;

    const cookies = RequestUtils.getCookies(headers);
    debug.event('-> RequestUtils.getCookies()', { tokens });
    const originalPath = cookies[getConfig().cookies.names.originalPath] || '/';
    let redirectTo = `${getConfig().hostURL}${originalPath}`;

    // login webhook handler (if any)
    if (getConfig().webhook.login) {
      debug.event('Making a webhook request upon login', {
        webhookURL: getConfig().webhook.login,
      });
      logger.child({
        webhookURL: getConfig().webhook.login
      }).info('Making a webhook request upon login');

      const resp = await fetch(getConfig().webhook.login, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokens,
          originalPath,
        })
      });

      if (!resp.ok) {
        debug.event('Login webhook request failed', { resp });
        logger.child({status: resp.status}).error('Login webhook request failed');
        throw new Error('Unable to make a login webhook request');
      }

      const result = await resp.json();
      debug.event('Login webhook request successful', { result });
      // check if tokens should be refreshed (can be useful for the scenario when webhook endpoint modified user record and new JWT tokens needs to be issued with updated information)
      if (result.refresh) {
        tokens = await OpenIDUtils.refreshTokens(tokens.refresh_token);
        debug.event('-> OpenIDUtils.refreshTokens()', { tokens });
      }

      // check if user access should be rejected (can be useful if webhook endpoint blocked user)
      if (result.reject) {
        debug.event('Webhook rejected the request');
        logger.child({originalPath}).info('Webhook rejected the request');
        if (getConfig().redirect.pageRequest.e403) {
          debug.event('Sending redirect response', {
            url: getConfig().redirect.pageRequest.e403,
          });
          sendRedirect(stream, headers, getConfig().redirect.pageRequest.e403);
        } else {
          debug.event('Sending 403 response', {
            reason: result.reason || 'Forbidden',
          });
          sendErrorResponse(stream, headers, 403, result.reason || 'Forbidden');
        }

        return;
      }

      if (result.meta) {
        debug.event('Webhook returned custom user attributes');
        metaToken = OpenIDUtils.prepareMetaToken(result.meta);
      }

      if (result.redirectTo) {
        redirectTo = result.redirectTo;

        // if relative path
        /* istanbul ignore else */
        if (redirectTo.indexOf('http') < 0) {
          // append slash if missing
          /* istanbul ignore else */
          if (redirectTo.indexOf('/') !== 0) {
            redirectTo = '/' + redirectTo;
          }
          redirectTo = `${getConfig().hostURL}${redirectTo}`;
        }

        debug.event('Webhook returned custom redirect endpoint', {
          redirectTo,
        });
      }
    }

    const cookiesToSet = prepareSetCookies(prepareAuthCookies(tokens, metaToken));
    debug.event('Sending redirect', {
      redirectTo,
      cookiesToSet,
    });
    sendRedirect(stream, headers, redirectTo, {
      'Set-Cookie': cookiesToSet,
    });
  }
}
