import { IncomingMessage, ServerResponse } from "node:http";
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendErrorResponse, sendRedirect, setAuthCookies } from "../../utils/ResponseUtils";
import { OpenIDUtils } from "../../utils/OpenIDUtils";
import { RequestUtils } from "../../utils/RequestUtils";
import { Context } from "../../types/Context";

export const CallbackHandler: HttpRequestHandlerConfig = {
  /**
   * @inheritdoc
   */
  isMatching(method: HttpMethod, path: string, context: Context) {
    return RequestUtils.isMatching(
      context.debugger.child('CallbackHandler -> isMatching()', {method, path}),
      // request
      method, path,
      // expected
      'GET', getConfig().dynamic.openid.callbackPath,
    );
  },

  /**
   * @inheritdoc
   */
  async handle(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    const _ = context.debugger.child('CallbackHandler -> handle()', {method, path});
    let tokens = await OpenIDUtils.exchangeCode(req);
    _.debug('-> OpenIDUtils.exchangeCode()', { tokens });
    let metaToken: string;

    const cookies = RequestUtils.getCookies(req.headers);
    _.debug('-> RequestUtils.getCookies()', { cookies });
    const originalPath = cookies[getConfig().cookies.names.originalPath] || '/';
    let redirectTo = `${getConfig().hostURL}${originalPath}`;

    // login webhook handler (if any)
    if (getConfig().webhook.login) {
      _.info('Making a webhook request upon login', {
        webhookURL: getConfig().webhook.login,
      });

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
        _.error('Login webhook request failed', null, { statusCode: resp.status });
        throw new Error('Unable to make a login webhook request');
      }

      const result = await resp.json();
      _.debug('Login webhook request successful', { result });
      // check if tokens should be refreshed (can be useful for the scenario when webhook endpoint modified user record and new JWT tokens needs to be issued with updated information)
      if (result.refresh) {
        tokens = await OpenIDUtils.refreshTokens(tokens.refresh_token);
        _.debug('-> OpenIDUtils.refreshTokens()', { tokens });
      }

      // check if user access should be rejected (can be useful if webhook endpoint blocked user)
      if (result.reject) {
        _.info('Webhook rejected the request');
        if (getConfig().redirect.pageRequest.e403) {
          _.debug('Sending redirect response', {
            url: getConfig().redirect.pageRequest.e403,
          });
          sendRedirect(_, req, res, getConfig().redirect.pageRequest.e403);
        } else {
          sendErrorResponse(_, req, 403, result.reason || 'Forbidden', res);
        }

        return;
      }

      if (result.meta) {
        _.debug('Webhook returned custom user attributes', { meta: result.meta });
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

        _.debug('Webhook returned custom redirect endpoint', {
          redirectTo,
        });
      }
    }

    setAuthCookies(res, tokens, metaToken);
    await sendRedirect(_, req, res, redirectTo);
  }
}
