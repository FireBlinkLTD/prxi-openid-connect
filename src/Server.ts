import 'dotenv/config';

import { Prxi } from 'prxi';
import { onShutdown } from "node-graceful-shutdown";

import { getConfig, getSanitizedConfig } from "./config/getConfig";

import getLogger from "./Logger";
import { CallbackHandler } from './handlers/http/CallbackHandler';
import { HealthHandler } from './handlers/http/HealthHandler';
import { ProxyHandler } from './handlers/http/ProxyHandler';
import { errorHandler } from './handlers/http/ErrorHandler';
import { http2ErrorHandler } from './handlers/http2/Http2ErrorHandler';

import { OpenIDUtils } from './utils/OpenIDUtils';
import { E404Handler } from './handlers/http/E404Handler';
import { LogoutHandler } from './handlers/http/LogoutHandler';
import { LoginHandler } from './handlers/http/LoginHandler';
import { WebSocketHandler } from './handlers/WebsocketHandler';
import { Http2HealthHandler } from './handlers/http2/Http2HealthHandler';
import { Http2E404Handler } from './handlers/http2/Http2E404Handler';
import { Http2LoginHandler } from './handlers/http2/Http2LoginHandler';
import { Http2LogoutHandler } from './handlers/http2/Http2LogoutHandler';
import { Http2CallbackHandler } from './handlers/http2/Http2CallbackHandler';
import { Http2ProxyHandler } from './handlers/http2/Http2ProxyHandler';
import { Debugger, DisabledDebugger } from './utils/Debugger';
import { randomUUID } from 'crypto';
import { IncomingHttpHeaders } from 'http';
import { constants } from 'http2';

// Prepare logger

let prxi: Prxi;
export const start = async (): Promise<Prxi> => {
  const logger = getLogger('Server');
  const config = getConfig();

  logger.child({config: getSanitizedConfig()}).debug('Configuration');

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
  const beforeRequest = (headers: IncomingHttpHeaders, context: Record<string, any>) => {
    const requestId = (headers['x-correlation-id'] || headers['x-trace-id'] || headers['x-request-id'] || randomUUID()).toString();
    context.requestId = requestId;
    context.debugger = isDebug ? new Debugger('Root', requestId) : DisabledDebugger;
  }

  // After request hook
  const afterRequest = (method: string, path: string, context: Record<string, any>) => {
    if (context.debugger.enabled) {
      console.log(`vvvvvvvvvvvvvvvvvvvvvvvvvvvv ${method}: ${path} vvvvvvvvvvvvvvvvvvvvvvvvvvvv`);
      console.log(context.debugger.toString());
      console.log(`^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ${method}: ${path} ^^^^^^^^^^^^^^^^^^^^^^^^^^^^`);
    }
  }

  // Prepare proxy configuration
  prxi = new Prxi({
    mode: config.mode,
    secure: config.secure,
    logInfo: (message: any, ...params: any[]) => {
      logger.child({params}).debug(message);
    },
    logError: (message: any, ...params: any[]) => {
      /* istanbul ignore next */
      logger.child({params}).error(message);
    },
    port: config.port,
    hostname: config.hostname,
    errorHandler,
    http2ErrorHandler,
    proxyRequestTimeout: config.proxyRequestTimeout,
    responseHeaders: config.headers.response,
    proxyRequestHeaders: config.headers.request,
    on: {
      beforeHTTPRequest: (req, res, ctx) => {
        beforeRequest(req.headers, ctx);
      },

      afterHTTPRequest: (req, res, ctx) => {
        afterRequest(req.method, req.url, ctx);
      },

      beforeHTTP2Request: (stream, headers, ctx) => {
        beforeRequest(headers, ctx);
      },

      afterHTTP2Request: (stream, headers, ctx) => {
        afterRequest(
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
          CallbackHandler,
          new ProxyHandler(),
          E404Handler,
        ],
        http2RequestHandlers: [
          Http2HealthHandler,
          new Http2LoginHandler(),
          new Http2LogoutHandler(),
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
  onShutdown(async () => {
    logger.info('Gracefully shutting down the server');
    await prxi.stop();
  });

  return prxi;
}
