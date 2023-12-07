import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { invalidateAuthCookies, sendRedirect } from "../../utils/ResponseUtils";
import { OpenIDUtils } from "../../utils/OpenIDUtils";
import { Logger } from "pino";
import getLogger from "../../Logger";
import { JwtPayload, verify } from "jsonwebtoken";
import { RequestUtils } from "../../utils/RequestUtils";

export class LogoutHandler implements HttpRequestHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('LogoutHandler')
  }

  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string): boolean {
    return method === 'GET' && path === getConfig().logoutPath;
  }

  /**
   * @inheritdoc
   */
  public async handle(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest): Promise<void> {
    this.logger.info('Handle logout request');
    invalidateAuthCookies(res);
    await this.handleWebhook(req);

    await sendRedirect(req, res, OpenIDUtils.getEndSessionUrl());
  }

  /**
   * Handle logout webhook request if configured
   * @param req
   */
  private async handleWebhook(req: IncomingMessage): Promise<void> {
    if (getConfig().webhook.logout) {
      this.logger.child({
        webhookURL: getConfig().webhook.logout
      }).info('Making a webhook request upon logout');

      const cookies = RequestUtils.getCookies(req.headers);
      let metaPayload: Record<string, any> = null;
      const metaToken = cookies[getConfig().cookies.names.meta];
      if (metaToken) {
        metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
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
        this.logger.child({status: resp.status}).error('Logout webhook request failed');
        throw new Error('Unable to make a logout webhook request');
      }
    }
  }
}
