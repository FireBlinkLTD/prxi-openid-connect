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
import { Context } from "../../types/Context";
import { Debugger } from "../../utils/Debugger";

export class Http2LogoutHandler implements Http2RequestHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('Http2LogoutHandler')
  }

  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const debug = context.debugger.child('Http2LogoutHandler -> isMatching', {method, path});
    const matching = method === 'GET' && path === getConfig().logoutPath;
    debug.event('Matching', {matching});

    return matching;
  }

  /**
   * @inheritdoc
   */
  public async handle (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    const debug = context.debugger.child('Http2LogoutHandler -> handle', {method, path});
    this.logger.info('Handle logout request');
    await this.handleWebhook(debug.child('-> handleWebhook()'), headers);

    const cookiesToSet = prepareSetCookies(prepareInvalidatedAuthCookies());
    debug.event('Sending redirect', {

    })
    sendRedirect(stream, headers, OpenIDUtils.getEndSessionUrl(), {
      'Set-Cookie': cookiesToSet,
    });
  }

  /**
   * Handle logout webhook request if configured
   * @param debug
   * @param req
   */
  private async handleWebhook(debug: Debugger, headers: IncomingHttpHeaders): Promise<void> {
    if (getConfig().webhook.logout) {
      debug.event('Making a webhook request upon logout', {
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
        debug.event('Meta token found', {
          metaPayload,
        })
      }

      let accessToken = cookies[getConfig().cookies.names.accessToken];
      let idToken = cookies[getConfig().cookies.names.idToken];

      debug.event('Making a POST request to', {
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
        debug.event('Request failed', {
          resp,
        })
        this.logger.child({status: resp.status}).error('Logout webhook request failed');
        throw new Error('Unable to make a logout webhook request');
      } else {
        debug.event('Request completed', {
          resp,
        })
      }
    }
  }
}
