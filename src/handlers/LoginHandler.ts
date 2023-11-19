import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { getConfig } from "../config/getConfig";
import { invalidateAuthCookies, sendRedirect } from "../utils/ResponseUtils";
import { OpenIDUtils } from "../utils/OpenIDUtils";
import { Logger } from "pino";
import getLogger from "../Logger";
import { parse } from "url";

export class LoginHandler implements RequestHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('LoginHandler')
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
  public async handle(req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest): Promise<void> {
    this.logger.info('Handle login request');

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

    await sendRedirect(res, OpenIDUtils.getAuthorizationUrl());
  }
}
