import { HttpMethod, ProxyRequest, Http2RequestHandlerConfig } from "prxi";
import { getConfig } from "../../config/getConfig";
import { sendRedirect } from "../../utils/Http2ResponseUtils";
import { OpenIDUtils } from "../../utils/OpenIDUtils";
import { Logger } from "pino";
import getLogger from "../../Logger";
import { ServerHttp2Stream, IncomingHttpHeaders, constants } from "http2";
import { prepareInvalidatedAuthCookies, prepareSetCookies } from "../../utils/ResponseUtils";

const emptyObj = {};

export class Http2LoginHandler implements Http2RequestHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('Http2LoginHandler')
  }

  /**
   * @inheritdoc
   */
  public isMatching(method: HttpMethod, path: string): boolean {
    return method === 'GET' && path === getConfig().loginPath;
  }

  /**
   * @inheritdoc
   */
  public async handle(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest): Promise<void> {
    this.logger.info('Handle login request');

    const path = headers[constants.HTTP2_HEADER_PATH];
    const redirectTo = new URL('http://localhost' + path).searchParams.get('redirectTo')

    const cookies = prepareInvalidatedAuthCookies({
      ...(redirectTo
        ? {
          [getConfig().cookies.names.originalPath]: {
            value: redirectTo.toString(),
            expires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
          }
        }
        : emptyObj),
    });

    sendRedirect(stream, headers, OpenIDUtils.getAuthorizationUrl(), {
      'Set-Cookie': prepareSetCookies(cookies),
    });
  }
}
