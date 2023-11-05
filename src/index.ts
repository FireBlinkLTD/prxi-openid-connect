#!/usr/bin/env node

import { Prxi } from "prxi";
import getLogger from "./Logger";
import { start } from "./Server";

let prxi: Prxi;
// start server
(async () => {
  try {
    prxi = await start();
  } catch (e) {
    const logger = getLogger('index');
    logger.child({error: e.message}).error('Failed to start proxy server');
    process.exit(1);
  }
})();

/**
 * Try to stop proxy when error ocurred
 */
const stopOnError = () => {
  const promise = prxi?.stop();
  if (promise) {
    promise.finally(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  try {
    const logger = getLogger('index');
    logger.child({error: err}).error(`Unhandled exception: ${err.message}`);
  } catch (e) {
    console.error('Unhandled exception', err);
  }

  stopOnError();
});

process.on('unhandledRejection', (reason) => {
  try {
    const logger = getLogger('index');
    logger.child({reason}).error(`Unhandled rejection`);
  } catch (e) {
    console.error(`Unhandled rejection: ${reason}`);
  }

  stopOnError();
});
