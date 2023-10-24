import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { getConfig } from "../config/getConfig";
import { sendErrorResponse, sendRedirect, setAuthCookies } from "../utils/ResponseUtils";
import { OpenIDUtils } from "../utils/OpenIDUtils";
import { parse } from "cookie";
import getLogger from "../Logger";

export const CallbackHandler: RequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string) => {
    return method === 'GET' && path === getConfig().openid.callbackPath;
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest) => {
    const logger = getLogger('CallbackHandler');
    let tokens = await OpenIDUtils.exchangeCode(req);
    let metaToken: string;

    const cookies = parse(req.headers.cookie);
    const originalPath = cookies[getConfig().cookies.names.originalPath] || '/';

    // login webhook handler (if any)
    if (getConfig().webhook.login) {
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
        logger.child({status: resp.status}).error('Login webhook request failed');
        throw new Error('Unable to make a login webhook request');
      }

      const result = await resp.json();
      // check if tokens should be refreshed (can be useful for the scenario when webhook endpoint modified user record and new JWT tokens needs to be issued with updated information)
      if (result.refresh) {
        tokens = await OpenIDUtils.refreshTokens(tokens.refresh_token);
      }

      // check if user access should be rejected (can be useful if webhook endpoint blocked user)
      if (result.reject) {
        logger.child({originalPath}).info('Webhook rejected the request');
        if (getConfig().redirect.pageRequest.e403) {
          sendRedirect(res, getConfig().redirect.pageRequest.e403);
        } else {
          sendErrorResponse(req, 403, result.reason || 'Forbidden', res);
        }

        return;
      }

      if (result.meta) {
        logger.child({meta: result.meta}).debug('Webhook returned custom user attributes');
        metaToken = OpenIDUtils.prepareMetaToken(result.meta);
      }
    }

    setAuthCookies(res, tokens, metaToken);
    await sendRedirect(res, `${getConfig().hostURL}${originalPath}`);
  }
}
