import pino from "pino";
import { getConfig } from "./config/getConfig";

/**
 * Get logger
 * @param context
 * @param tag
 * @returns
 */
const getLogger = (tag: string) => {
  return pino({
    name: '@prxi/openid-connect',
    level: getConfig().logLevel,
    mixin() {
      return { tag }
    },
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    base: {
      pid: undefined,
      hostname: getConfig().hostname,
    }
  });
};

export default getLogger;
