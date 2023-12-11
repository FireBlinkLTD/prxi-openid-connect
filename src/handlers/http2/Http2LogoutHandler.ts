import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendRedirect } from "../../utils/Http2ResponseUtils";
import { OpenIDUtils } from "../../utils/OpenIDUtils";
import { Logger } from "pino";
import getLogger from "../../Logger";
import { JwtPayload, verify } from "jsonwebtoken";
import { RequestUtils } from "../../utils/RequestUtils";
import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";
import { prepareInvalidatedAuthCookies, prepareSetCookies } from "../../utils/ResponseUtils";
import { Debugger } from "../../utils/Debugger";
import { Context } from "../../types/Context";

export class Http2LogoutHandler implements Http2RequestHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('Http2LogoutHandler')
  }

  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const _ = context.debugger.child('Http2LogoutHandler -> isMatching', {method, path});
    const matching = method === 'GET' && path === getConfig().logoutPath;
    _.debug('Matching', {matching});

    return matching;
  }

  /**
   * @inheritdoc
   */
  public async handle (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    const _ = context.debugger.child('Http2LogoutHandler -> handle', {method, path});
    this.logger.info('Handle logout request');
    await this.handleWebhook(_.child('-> handleWebhook()'), headers);

    const cookiesToSet = prepareSetCookies(prepareInvalidatedAuthCookies());
    _.debug('Sending redirect', {

    })
    sendRedirect(_, stream, headers, OpenIDUtils.getEndSessionUrl(), {
      'Set-Cookie': cookiesToSet,
    });
  }

  /**
   * Handle logout webhook request if configured
   * @param debug
   * @param req
   */
  private async handleWebhook(_: Debugger, headers: IncomingHttpHeaders): Promise<void> {
    if (getConfig().webhook.logout) {
      _.debug('Making a webhook request upon logout', {
        webhookURL: getConfig().webhook.logout
      });

      this.logger.child({
        webhookURL: getConfig().webhook.logout
      }).info('Making a webhook request upon logout');

      const cookies = RequestUtils.getCookies(headers);
      let metaPayload: Record<string, any> = null;
      const metaToken = cookies[getConfig().cookies.names.meta];
      if (metaToken) {
        metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
          complete: false,
        });
        _.debug('Meta token found', {
          metaPayload,
        })
      }

      let accessToken = cookies[getConfig().cookies.names.accessToken];
      let idToken = cookies[getConfig().cookies.names.idToken];

      _.debug('Making a POST request to', {
        webhookURL: getConfig().webhook.logout
      })
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
        _.debug('Request failed', {
          resp,
        })
        this.logger.child({status: resp.status}).error('Logout webhook request failed');
        throw new Error('Unable to make a logout webhook request');
      } else {
        _.debug('Request completed', {
          resp,
        })
      }
    }
  }
}
