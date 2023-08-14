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

// Prepare logger

let prxi: Prxi;
export const start = async (): Promise<Prxi> => {
  const logger = getLogger('Server');
  const config = getConfig();

  logger.child({config}).info('Configuration');

  // Prepare proxy configuration
  prxi = new Prxi({
    logInfo: (message: any, ...params: any[]) => {
      logger.child({params}).info(message);
    },
    logError: (message: any, ...params: any[]) => {
      /* istanbul ignore next */
      logger.child({params}).error(message);
    },
    port: config.port,
    hostname: config.hostname,
    errorHandler,
    upstream: [
      {
        target: config.upstream,
        requestHandlers: [
          HealthHandler,
          CallbackHandler,
          new ProxyHandler(),
          E404Handler,
        ]
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
