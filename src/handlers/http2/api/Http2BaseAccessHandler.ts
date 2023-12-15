import { HttpMethod, Http2RequestHandlerConfig, ProxyRequest } from "prxi";
import { Context } from "../../../types/Context";
import { getConfig } from "../../../config/getConfig";
import { RequestUtils } from "../../../utils/RequestUtils";
import { JwtPayload, verify } from "jsonwebtoken";
import { handleHttp2AuthenticationFlow } from "../../../utils/AccessUtils";
import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";

export abstract class Http2BaseAccessHandler implements Http2RequestHandlerConfig {
  /**
   * @inheritdoc
   */
  abstract isMatching(method: HttpMethod, path: string, context: Context): boolean;

  /**
   * @inheritdoc
   */
  async handle(stream: ServerHttp2Stream, headers: IncomingHttpHeaders, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) {
    context.api = true;

    const _ = context.debugger.child('Http2BaseAccessHandler -> handle()', { context, headers, method, path });
    const cookies = RequestUtils.getCookies(headers);
    _.debug('-> RequestUtils.getCookies()', { cookies });

    let metaPayload: Record<string, any> = null;
    const metaToken = cookies[getConfig().cookies.names.meta];
    if (metaToken) {
      metaPayload = <JwtPayload> verify(metaToken, getConfig().jwt.metaTokenSecret, {
        complete: false,
      });
      _.debug('Meta cookie found', { metaPayload });
      context.metaPayload = metaPayload?.p;
    }

    let { reject: breakFlow, cookiesToSet} = await handleHttp2AuthenticationFlow(
      _.child('-> handleAuthenticationFlow()'),
      stream,
      headers,
      cookies,
      method,
      path,
      context,
      metaPayload
    );
    if (breakFlow) {
      _.debug('Breaking upon authentication');
      return;
    }

    await this.process(stream, headers, proxyRequest, method, path, context, cookiesToSet);
  }

  /**
   * Called after handle()
   * @param stream
   * @param headers
   * @param proxyRequest
   * @param method
   * @param path
   * @param context
   * @param cookiesToSet
   */
  abstract process(
    stream: ServerHttp2Stream,
    headers: IncomingHttpHeaders,
    proxyRequest: ProxyRequest,
    method: HttpMethod,
    path: string,
    context: Context,
    cookiesToSet?: Record<string, {value: string, expires?: Date}>
  ): Promise<void>;
}
