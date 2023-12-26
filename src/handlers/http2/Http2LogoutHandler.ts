import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendErrorResponse, sendRedirect } from "../../utils/Http2ResponseUtils";
import { OpenIDUtils } from "../../utils/OpenIDUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { RequestUtils } from "../../utils/RequestUtils";
import { IncomingHttpHeaders, ServerHttp2Stream } from "node:http2";
import { prepareInvalidatedAuthCookies, prepareSetCookies } from "../../utils/ResponseUtils";
import { Debugger } from "../../utils/Debugger";
import { Context } from "../../types/Context";

export class Http2LogoutHandler implements Http2RequestHandlerConfig {
  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
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
  public async handle(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    const _ = context.debugger.child('Http2LogoutHandler -> handle()', {method, path});
    const cookiesToSet = prepareSetCookies(prepareInvalidatedAuthCookies());

    let redirectTo = OpenIDUtils.getEndSessionUrl();
    try {
      await this.handleWebhook(_.child('-> handleWebhook()'), headers);
    } catch (e) {
      if (getConfig().redirect.pageRequest.e500) {
        redirectTo = getConfig().redirect.pageRequest.e500;
      } else {
        sendErrorResponse(_, stream, headers, 500, 'Unexpected error occurred', {
          'Set-Cookie': cookiesToSet,
        })
        return
      }
    }

    sendRedirect(_, stream, headers, redirectTo, {
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

      const cookies = RequestUtils.getCookies(headers);
      let metaPayload: Record<string, any> = null;
      const metaToken = cookies[getConfig().cookies.names.meta];
      if (metaToken) {
        metaPayload = <JwtPayload> verify(metaToken, getConfig().dynamic.jwt.metaTokenSecret, {
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
        _.error('Logout webhook request failed', null, { statusCode: resp.status });
        throw new Error('Unable to make a logout webhook request');
      } else {
        _.debug('Request completed', {
          resp,
        })
      }
    }
  }
}
