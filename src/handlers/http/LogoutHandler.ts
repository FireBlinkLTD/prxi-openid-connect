import { IncomingMessage, ServerResponse } from "node:http";
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { invalidateAuthCookies, sendRedirect } from "../../utils/ResponseUtils";
import { OpenIDUtils } from "../../utils/OpenIDUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { RequestUtils } from "../../utils/RequestUtils";
import { Context } from "../../types/Context";
import { Debugger } from "../../utils/Debugger";

export class LogoutHandler implements HttpRequestHandlerConfig {
  /**
   * @inheritdoc
   */
  isMatching(method: HttpMethod, path: string, context: Context): boolean {
    return RequestUtils.isMatching(
      context.debugger.child('LogoutHandler -> isMatching()', {method, path}),
      // request
      method, path,
      // expected
      'GET', getConfig().paths.logout,
    );
  }

  /**
   * @inheritdoc
   */
  async handle(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context): Promise<void> {
    const _ = context.debugger.child('LogoutHandler -> handle()', {method, path});
    invalidateAuthCookies(res);
    await this.handleWebhook(_, req);

    await sendRedirect(_, req, res, OpenIDUtils.getEndSessionUrl());
  }

  /**
   * Handle logout webhook request if configured
   * @param req
   */
  private async handleWebhook(_: Debugger, req: IncomingMessage): Promise<void> {
    if (getConfig().webhook.logout) {
      _.debug('Making a webhook request upon logout', {
        webhookURL: getConfig().webhook.logout
      });

      const cookies = RequestUtils.getCookies(req.headers);
      let metaPayload: Record<string, any> = null;
      const metaToken = cookies[getConfig().cookies.names.meta];
      if (metaToken) {
        metaPayload = <JwtPayload> verify(metaToken, getConfig().dynamic.jwt.metaTokenSecret, {
          complete: false,
        });
      }

      let accessToken = cookies[getConfig().cookies.names.accessToken];
      let idToken = cookies[getConfig().cookies.names.idToken];

      const resp = await fetch(getConfig().webhook.logout, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokens: {
            access_token: accessToken,
            id_token: idToken,
          },
          meta: metaPayload?.p,
        })
      });

      if (!resp.ok) {
        _.error('Logout webhook request failed', null, { statusCode: resp.status });
        throw new Error('Unable to make a logout webhook request');
      }
    }
  }
}
