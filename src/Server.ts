import 'dotenv/config';

import { Prxi } from 'prxi';
import { onShutdown } from "node-graceful-shutdown";

import { getConfig } from "./ServerConfig";

import getLogger from "./Logger";
import { CallbackHandler } from './handlers/CallbackHandler';
import { HealthHandler } from './handlers/HealthHandler';
import { ProxyHandler } from './handlers/ProxyHandler';
import { errorHandler } from './handlers/ErrorHandler';

import { OpenIDUtils } from './utils/OpenIDUtils';
import { E404Handler } from './handlers/E404Handler';

// Prepare logger

let prxi: Prxi;
const handler = async () => {
  const logger = getLogger('Server');
  const config = getConfig();

  logger.child({config}).info('Configuration');

  try {
    // Prepare proxy configuration
    prxi = new Prxi({
      logInfo: (message: any, ...params: any[]) => {
        logger.child({params}).info(message);
      },
      logError: (message: any, ...params: any[]) => {
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

    onShutdown(async () => {
      logger.info('Gracefully shutting down the server');
      await prxi.stop();
    });
  } catch (e) {
    logger.child({error: e.message, config}).error('Failed to start proxy server');
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  try {
    const logger = getLogger('Server');
    logger.child({error: err}).error(`Unhandled exception: ${err.message}`);
  } catch (e) {
    console.error('Unhandled exception', err);
  }

  let promise = prxi?.stop();
  if (promise) {
    promise.finally(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  try {
    const logger = getLogger('Server');
    logger.child({reason}).error(`Unhandled rejection`);
  } catch (e) {
    console.error(`Unhandled rejection: ${reason}`);
  }

  let promise = prxi?.stop();
  if (promise) {
    promise.finally(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

handler();
