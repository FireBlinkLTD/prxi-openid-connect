import { IncomingMessage } from "http";
import { Socket } from "net";
import { ProxyRequest, WebSocketHandlerConfig, WebSocketProxyCancelRequest } from "prxi";
import { Mapping } from "../config/Mapping";
import { getConfig } from "../config/getConfig";
import { RequestUtils } from "../utils/RequestUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { JWTVerificationResult, OpenIDUtils } from "../utils/OpenIDUtils";
import getLogger from "../Logger";
import { Logger } from "pino";

export class WebSocketHandler implements WebSocketHandlerConfig {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('WebSocketHandler')
  }

  /**
   * @inheritdoc
   */
  public isMatching(path: string, context: Record<string, any>): boolean {
    context.wsMapping = this.findMatchingMapping(getConfig().mappings.ws, path);

    return !!context.wsMapping;
  }

  /**
   * @inheritdoc
   */
  public async handle(req: IncomingMessage, socket: Socket, head: Buffer, proxyRequest: ProxyRequest, cancelRequest: WebSocketProxyCancelRequest, path: string, context: Record<string, any>): Promise<void> {
    const cookies = RequestUtils.getCookies(req);

    context.accessToken = cookies[getConfig().cookies.names.accessToken];
    context.idToken = cookies[getConfig().cookies.names.idToken];

    let breakFlow =  await this.handleAuthenticationFlow(context);
    if (breakFlow) {
      cancelRequest(401, 'Unauthorized');
      return;
    }


    breakFlow =  await this.handleAuthorizationFlow(context);
    if (breakFlow) {
      cancelRequest(403, 'Forbidden');
      return;
    }

    let metaPayload: Record<string, any> = null;
    const metaToken = cookies[getConfig().cookies.names.meta];
    if (metaToken) {
      metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
        complete: false,
      });
    }

    const proxyRequestHeaders: Record<string, string> = {};
    if (getConfig().headers.claims.auth.all) {
      proxyRequestHeaders[getConfig().headers.claims.auth.all] = JSON.stringify(context.claims?.auth?.all || {});
    }

    if (getConfig().headers.claims.auth.matching) {
      proxyRequestHeaders[getConfig().headers.claims.auth.matching] = JSON.stringify(context.claims?.auth?.matching || {});
    }

    if (getConfig().headers.claims.proxy) {
      proxyRequestHeaders[getConfig().headers.claims.proxy] = JSON.stringify(context.claims?.proxy || {});
    }

    if (getConfig().headers.meta && metaPayload?.p) {
      proxyRequestHeaders[getConfig().headers.meta] = JSON.stringify(metaPayload.p);
    }

    await proxyRequest({
      proxyRequestHeaders,
    });
  }

  /**
   * Handle authentication flow
   * @param req
   * @param socket
   * @param head
   * @param path
   * @param context
   * @returns
   */
  private async handleAuthenticationFlow(context: Record<string, any>): Promise<boolean> {
    if (context.accessToken) {
      const { jwt, verificationResult } = await OpenIDUtils.parseTokenAndVerify(context.accessToken);
      if (verificationResult !== JWTVerificationResult.SUCCESS) {
        return true;
      }

      context.accessTokenJWT = jwt;
    }

    if (context.idToken) {
      const { jwt, verificationResult } = await OpenIDUtils.parseTokenAndVerify(context.idToken);
      if (verificationResult !== JWTVerificationResult.SUCCESS) {
        return true;
      }

      context.idTokenJWT = jwt;
    }

    return false;
  }

  /**
   * Handle authorization flow
   * @param req
   * @param socket
   * @param head
   * @param path
   * @param context
   * @returns
   */
  private async handleAuthorizationFlow(context: Record<string, any>): Promise<boolean> {
    const { accessTokenJWT, idTokenJWT, wsMapping } = context;
    context.claims = RequestUtils.isAllowedAccess(this.logger, accessTokenJWT, idTokenJWT, wsMapping);

    return !context.claims;
  }

  /**
   * Check if request is matching method
   * @param mappings
   * @param method
   * @param path
   * @returns
   */
  private findMatchingMapping(mappings: Mapping[], path: string): Mapping | null {
    for (const mapping of mappings) {
      if (mapping.pattern.exec(path)) {
        return mapping;
      }
    }

    return null;
  }
}
