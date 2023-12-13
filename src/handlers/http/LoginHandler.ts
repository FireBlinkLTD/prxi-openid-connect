import { IncomingMessage, ServerResponse } from 'node:http';
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from 'prxi';
import { getConfig } from '../../config/getConfig';
import { invalidateAuthCookies, sendRedirect } from '../../utils/ResponseUtils';
import { OpenIDUtils } from '../../utils/OpenIDUtils';
import { parse } from 'url';
import { Context } from '../../types/Context';

export class LoginHandler implements HttpRequestHandlerConfig {

  /**
   * @inheritdoc
   */
  isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const _ = context.debugger.child('LoginHandler -> isMatching', {method, path});
    const match = method === 'GET' && path === getConfig().loginPath;
    _.debug('Matching result', {match});

    return match;
  }

  /**
   * @inheritdoc
   */
  async handle(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context): Promise<void> {
    const _ = context.debugger.child('LoginHandler -> handle', {method, path});

    const { redirectTo } = parse(req.url, true).query;
    if (redirectTo) {
      invalidateAuthCookies(res, {
        [getConfig().cookies.names.originalPath]: {
          value: redirectTo.toString(),
          expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
      });
    } else {
      invalidateAuthCookies(res);
    }

    await sendRedirect(_, req, res, OpenIDUtils.getAuthorizationUrl());
  }
}
