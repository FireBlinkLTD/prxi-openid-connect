import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { getConfig } from "../config/getConfig";
import { sendRedirect } from "../utils/ResponseUtils";
import { OpenIDUtils } from "../utils/OpenIDUtils";
import { Logger } from "pino";
import getLogger from "../Logger";

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

    await sendRedirect(res, OpenIDUtils.getAuthorizationUrl());
  }
}
