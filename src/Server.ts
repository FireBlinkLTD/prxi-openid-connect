import 'dotenv/config';

import { Prxi } from 'prxi';
import { onShutdown } from "node-graceful-shutdown";

import { getConfig } from "./config/getConfig";

import getLogger from "./Logger";
import { CallbackHandler } from './handlers/CallbackHandler';
import { HealthHandler } from './handlers/HealthHandler';
import { ProxyHandler } from './handlers/ProxyHandler';
import { errorHandler } from './handlers/ErrorHandler';

import { OpenIDUtils } from './utils/OpenIDUtils';
import { E404Handler } from './handlers/E404Handler';
import { LogoutHandler } from './handlers/LogoutHandler';
import { LoginHandler } from './handlers/LoginHandler';
import { WebSocketHandler } from './handlers/WebsocketHandler';

// Prepare logger

let prxi: Prxi;
export const start = async (): Promise<Prxi> => {
  const logger = getLogger('Server');
  const config = getConfig();

  logger.child({config}).debug('Configuration');

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

  // Prepare proxy configuration
  prxi = new Prxi({
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
    proxyRequestTimeout: config.proxyRequestTimeout,
    responseHeaders: config.headers.response,
    proxyRequestHeaders: config.headers.request,
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
        webSocketHandlers: [
          new WebSocketHandler()
        ],
      }
    ]
  });

  await OpenIDUtils.init();

  logger.child({config}).info('Starting listening connections');
  await prxi.start();

  /* istanbul ignore next */
  onShutdown(async () => {
    logger.info('Gracefully shutting down the server');
    await prxi.stop();
  });

  return prxi;
}
