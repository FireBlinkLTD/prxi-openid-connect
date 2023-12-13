import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig } from 'prxi';
import { getConfig } from '../../config/getConfig';
import { sendRedirect } from '../../utils/Http2ResponseUtils';
import { OpenIDUtils } from '../../utils/OpenIDUtils';
import { ServerHttp2Stream, IncomingHttpHeaders, constants } from 'node:http2';
import { prepareInvalidatedAuthCookies, prepareSetCookies } from '../../utils/ResponseUtils';
import { Context } from '../../types/Context';

const emptyObj = {};

export class Http2LoginHandler implements Http2RequestHandlerConfig {
  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string, context: Context): boolean {
    const _ = context.debugger.child('Http2LoginHandler -> isMatching', {method, path});
    const match = method === 'GET' && path === getConfig().loginPath;
    _.debug('Matching result', {match});

    return match;
  }

  /**
   * @inheritdoc
   */
  public async handle (stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    const _ = context.debugger.child('Http2LoginHandler -> handle', {method, path});

    const fullPath = headers[constants.HTTP2_HEADER_PATH];
    const redirectTo = new URL('http://localhost' + fullPath).searchParams.get('redirectTo')

    const cookies = prepareSetCookies(prepareInvalidatedAuthCookies({
      ...(redirectTo
        ? {
          [getConfig().cookies.names.originalPath]: {
            value: redirectTo.toString(),
            expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          }
        }
        : emptyObj),
    }));

    const authURL = OpenIDUtils.getAuthorizationUrl();
    sendRedirect(_, stream, headers, authURL, {
      'Set-Cookie': cookies,
    });
  }
}
