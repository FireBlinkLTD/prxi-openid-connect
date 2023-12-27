import { Logger, createLogger, format, transports } from "winston";
import DailyRotateFile = require('winston-daily-rotate-file');
import { getConfig } from "./config/getConfig";

/**
 * Get logger
 * @param context
 * @param tag
 * @returns
 */
const getLogger = (tag: string): Logger => {
  const { log } = getConfig();
  const logger = createLogger({
    format: format.combine(
      format.timestamp(),
      log.pretty ? format.prettyPrint() : format.json()
    ),
    level: log.level,
    defaultMeta: {
      name: '@prxi/openid-connect',
      version: process.env.npm_package_version,
      tag
    },
    transports: [
      new transports.Console(),
    ]
  });

  if (log.file) {
    logger.add(new DailyRotateFile({
      filename: log.file,
      maxFiles: log.rotate.maxFiles,
      maxSize: log.rotate.maxSize,
      datePattern: log.rotate.datePattern,
    }));
  }

  return logger;
};

export default getLogger;
