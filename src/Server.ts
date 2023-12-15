import 'dotenv/config';

import { Prxi } from "prxi";
import { onShutdown } from "node-graceful-shutdown";

import { getConfig, getSanitizedConfig } from "./config/getConfig";

import getLogger from "./Logger";
import { CallbackHandler } from "./handlers/http/CallbackHandler";
import { HealthHandler } from "./handlers/http/HealthHandler";
import { ProxyHandler } from "./handlers/http/ProxyHandler";
import { errorHandler } from "./handlers/http/ErrorHandler";
import { http2ErrorHandler } from "./handlers/http2/Http2ErrorHandler";

import { OpenIDUtils } from "./utils/OpenIDUtils";
import { E404Handler } from "./handlers/http/E404Handler";
import { LogoutHandler } from "./handlers/http/LogoutHandler";
import { LoginHandler } from "./handlers/http/LoginHandler";
import { WebSocketHandler } from "./handlers/WebsocketHandler";
import { Http2HealthHandler } from "./handlers/http2/Http2HealthHandler";
import { Http2E404Handler } from "./handlers/http2/Http2E404Handler";
import { Http2LoginHandler } from "./handlers/http2/Http2LoginHandler";
import { Http2LogoutHandler } from "./handlers/http2/Http2LogoutHandler";
import { Http2CallbackHandler } from "./handlers/http2/Http2CallbackHandler";
import { Http2ProxyHandler } from "./handlers/http2/Http2ProxyHandler";
import { Debugger } from "./utils/Debugger";
import { randomUUID } from "crypto";
import { IncomingHttpHeaders } from "node:http";
import { constants } from "node:http2";
import { Console } from "./utils/Console";
import { WhoamiAPIHandler } from "./handlers/http/api/WhoamiAPIHandler";
import { Http2WhoamiAPIHandler } from './handlers/http2/api/Http2WhoamiAPIHandler';
import { PermissionsAPIHandler } from './handlers/http/api/PermissionsAPIHandler';
import { Http2PermissionsAPIHandler } from './handlers/http2/api/Http2PermissionsAPIHandler';

/**
 * Start server
 * @param testMode
 * @returns
 */
export const start = async (): Promise<Prxi> => {
  const logger = getLogger('Server');
  const config = getConfig();

  logger.child({config: getSanitizedConfig()}).debug('Configuration');

  /* istanbul ignore next */
  if (!config.licenseConsent) {
    logger.error('###############################################################');
    logger.error('#                                                             #');
    logger.error('# In order to use prxi-openid-connect you need to provide a   #');
    logger.error('# consent that it will be used for personal, non-commercial,  #');
    logger.error('# under 30 days evaluation period or under a valid commercial #');
    logger.error('# license obtained from FireBlink.                            #');
    logger.error('#                                                             #');
    logger.error('###############################################################');

    throw new Error('Unable to start, license consent is not provided.');
  }

  const isDebug = config.logLevel.toLowerCase() === 'debug';

  // Before request hook
  const beforeRequest = (mode: string, method: string, path: string, headers: IncomingHttpHeaders, context: Record<string, any>) => {
    let enabled = isDebug;
    /* istanbul ignore else */
    if (isDebug && process.env.NODE_ENV === 'test' && path === '/favicon.ico') {
      enabled = false;
    }

    const requestId = (headers['x-correlation-id'] || headers['x-trace-id'] || headers['x-request-id'] || randomUUID()).toString();
    context.requestId = requestId;
    context.debugger = new Debugger('Root', context.sessionId, requestId, enabled);
    logger.child({ requestId, _: {mode, path: path.split('?')[0], method} }).info('Processing request - start');
  }

  // After request hook
  const afterRequest = (mode: string, method: string, path: string, context: Record<string, any>) => {
    path = path.split('?')[0];
    logger.child({
      requestId: context.requestId,
      _: {mode, path, method}
    }).info('Processing request - finished');
    /* istanbul ignore else */
    if (context.debugger.enabled) {
      Console.printSolidBox(`[REQUEST] [${mode}] ${method}: ${path}`);
      console.log(context.debugger.toString());
      Console.printDoubleBox(`[REQUEST] [${mode}] ${method}: ${path}`);
    }
  }

  // Prepare proxy configuration
  const prxi = new Prxi({
    mode: config.mode,
    secure: config.secure,
    log: {
      debug(context, message, params) {
        if (context.debugger) {
          context.debugger.debug(message, params);
        } else {
          logger.child({_: params}).debug(message);
        }
      },
      info(context, message, params) {
        /* istanbul ignore next */
        if (context.debugger) {
          context.debugger.info(message, params);
        } else {
          logger.child({_: params}).info(message);
        }
      },
      error(context, message, error, params) {
        /* istanbul ignore else */
        if (context.debugger) {
          context.debugger.error(message, error, params);
        } else {
          logger.child({_: params, error}).error(message);
        }
      }
    },
    port: config.port,
    hostname: config.hostname,
    errorHandler,
    http2ErrorHandler,
    proxyRequestTimeout: config.proxyRequestTimeout,
    responseHeaders: config.headers.response,
    proxyRequestHeaders: config.headers.request,
    on: {
      beforeHTTPRequest(req, res, ctx) {
        beforeRequest('HTTP/1.1', req.method, req.url, req.headers, ctx);
      },

      afterHTTPRequest(req, res, ctx) {
        afterRequest('HTTP/1.1', req.method, req.url, ctx);
      },

      upgrade(req, socket, head, ctx) {
        beforeRequest('WS', req.method, req.url, req.headers, ctx);
      },

      afterUpgrade(req, socket, head, ctx) {
        afterRequest('WS', req.method, req.url, ctx);
      },

      beforeHTTP2Session(session, context) {
        context.sessionId = randomUUID();
        context.debugger = new Debugger('Root', context.sessionId, undefined, isDebug);
      },

      beforeHTTP2Request(stream, headers, ctx) {
        beforeRequest(
          'HTTP/2',
          headers[constants.HTTP2_HEADER_METHOD].toString(),
          headers[constants.HTTP2_HEADER_PATH].toString(),
          headers,
          ctx,
        );
      },

      afterHTTP2Request(stream, headers, ctx) {
        afterRequest(
          'HTTP/2',
          headers[constants.HTTP2_HEADER_METHOD].toString(),
          headers[constants.HTTP2_HEADER_PATH].toString(),
          ctx);
      },
    },
    upstream: [
      {
        target: config.upstream,
        requestHandlers: [
          HealthHandler,
          new LoginHandler(),
          new LogoutHandler(),
          new WhoamiAPIHandler(),
          new PermissionsAPIHandler(),
          CallbackHandler,
          new ProxyHandler(),
          E404Handler,
        ],
        http2RequestHandlers: [
          Http2HealthHandler,
          new Http2LoginHandler(),
          new Http2LogoutHandler(),
          new Http2WhoamiAPIHandler(),
          new Http2PermissionsAPIHandler(),
          Http2CallbackHandler,
          new Http2ProxyHandler(),
          Http2E404Handler,
        ],
        webSocketHandlers: [
          new WebSocketHandler()
        ],
      }
    ]
  });

  await OpenIDUtils.init();

  logger.info('Starting listening connections');
  await prxi.start();

  /* istanbul ignore next */
  if (process.env.NODE_ENV !== 'test') {
    onShutdown(async () => {
      logger.info('Gracefully shutting down the server');
      await prxi.stop();
    });
  }

  return prxi;
}
