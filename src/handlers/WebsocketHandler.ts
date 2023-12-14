import { IncomingMessage } from "node:http";
import { Socket } from "net";
import { ProxyRequest, WebSocketHandlerConfig, WebSocketProxyCancelRequest } from "prxi";
import { Mapping } from "../config/Mapping";
import { getConfig } from "../config/getConfig";
import { RequestUtils } from "../utils/RequestUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { JWTVerificationResult, OpenIDUtils } from "../utils/OpenIDUtils";
import { Context } from "mocha";
import { Debugger } from "../utils/Debugger";

export class WebSocketHandler implements WebSocketHandlerConfig {
  /**
   * @inheritdoc
   */
  public isMatching(path: string, context: Context): boolean {
    const _ = context.debugger.child('WebSocketHandler -> isMatching()', {path});
    context.wsMapping = this.findMatchingMapping(getConfig().mappings.ws, path);
    _.debug('Matching', {
      matching: !!context.wsMapping,
    })

    return !!context.wsMapping;
  }

  /**
   * @inheritdoc
   */
  public async handle(req: IncomingMessage, socket: Socket, head: Buffer, proxyRequest: ProxyRequest, cancelRequest: WebSocketProxyCancelRequest, path: string, context: Context): Promise<void> {
    const _ = context.debugger.child('WebSocketHandler -> handle()', {path});
    const cookies = RequestUtils.getCookies(req.headers);
    _.debug('-> RequestUtils.getCookies()', { cookies });

    context.accessToken = cookies[getConfig().cookies.names.accessToken];
    context.idToken = cookies[getConfig().cookies.names.idToken];

    let breakFlow = await this.handleAuthenticationFlow(
      _.child('-> handleAuthenticationFlow', { context }),
      context,
    );
    if (breakFlow) {
      _.debug('Breaking upon authentication');
      cancelRequest(401, 'Unauthorized');
      return;
    }

    breakFlow = await this.handleAuthorizationFlow(
      _.child('-> handleAuthorizationFlow', { context }),
      context,
    );
    if (breakFlow) {
      _.debug('Breaking upon authorization');
      cancelRequest(403, 'Forbidden');
      return;
    }

    let metaPayload: Record<string, any> = null;
    const metaToken = cookies[getConfig().cookies.names.meta];
    if (metaToken) {
      metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
        complete: false,
      });
      _.debug('Meta token found', { metaPayload });
    }

    const proxyRequestHeaders: Record<string, string | string[] | null> = {};
    if (getConfig().headers.claims.auth.all) {
      const value = JSON.stringify(context.claims?.auth?.all || {});
      _.debug('Adding "claims.auth.all" header', {
        name: getConfig().headers.claims.auth.all,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.auth.all] = value;
    }

    if (getConfig().headers.claims.auth.matching) {
      const value = JSON.stringify(context.claims?.auth?.matching || {});
      _.debug('Adding "claims.auth.matching" header', {
        name: getConfig().headers.claims.auth.matching,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.auth.matching] = value;
    }

    if (getConfig().headers.claims.proxy) {
      const value = JSON.stringify(context.claims?.proxy || {});
      _.debug('Adding "claims.proxy" header', {
        name: getConfig().headers.claims.proxy,
        value,
      });
      proxyRequestHeaders[getConfig().headers.claims.proxy] = value;
    }

    if (getConfig().headers.meta && metaPayload?.p) {
      const value = JSON.stringify(metaPayload.p);
      _.debug('Adding "meta" header', {
        name: getConfig().headers.meta,
        value,
      });
      proxyRequestHeaders[getConfig().headers.meta] = value;
    }

    proxyRequestHeaders['cookie'] = RequestUtils.prepareProxyCookies(req.headers, cookies);
    _.debug('Proceeding to proxy request', {
      proxyRequestHeaders,
    });

    await proxyRequest({
      proxyRequestHeaders,
    });
  }

  /**
   * Handle authentication flow
   * @param _
   * @param context
   * @returns
   */
  private async handleAuthenticationFlow(_: Debugger, context: Context): Promise<boolean> {
    let ok = false;
    if (context.accessToken) {
      const { jwt, verificationResult } = await OpenIDUtils.parseTokenAndVerify(context.accessToken);
      _.debug('Access token verification result', {
        verificationResult,
      });
      if (verificationResult !== JWTVerificationResult.SUCCESS) {
        _.debug('Authentication failed');
        return true;
      }

      context.accessTokenJWT = jwt;
      ok = true;
    }

    if (context.idToken) {
      const { jwt, verificationResult } = await OpenIDUtils.parseTokenAndVerify(context.idToken);
      _.debug('ID token verification result', {
        verificationResult,
      });
      if (verificationResult !== JWTVerificationResult.SUCCESS) {
        _.debug('Authentication failed');
        return true;
      }

      context.idTokenJWT = jwt;
    }

    if(!ok && context.wsMapping.auth.required) {
      _.debug('Authentication failed, no tokens provided');
      return true;
    }

    _.debug('Authentication passed');
    return false;
  }

  /**
   * Handle authorization flow
   * @param _
   * @param context
   * @param head
   * @param path
   * @param context
   * @returns
   */
  private async handleAuthorizationFlow(_: Debugger, context: Context): Promise<boolean> {
    const { accessTokenJWT, idTokenJWT, wsMapping } = context;
    context.claims = RequestUtils.isAllowedAccess(_.child('RequestUtils'), accessTokenJWT, idTokenJWT, wsMapping);
    _.debug('-> RequestUtils.isAllowedAccess()', { claims: context.claims });

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
