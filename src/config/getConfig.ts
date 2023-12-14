import { prepareMappings } from "./Mapping";
import { Config } from "./Config";
import { readFileSync } from "node:fs";

/**
 * Convert snake_case to camelCase
 * @param str
 * @returns
 */
export const snakeToCamelCase = (str: string) => {
  return str.toLowerCase().replace(
    /(_\w)/g,
    (m: string) => {
      return m.toUpperCase().substring(1);
    }
  );
}


let config: Config;

/**
 * Get TLS secure settings
 * @returns
 */
export const getSecureSettings = (): Record<string, string | number | Buffer> | undefined => {
  const secure: Record<string, string | number | Buffer>  = {};

  for (const key in process.env) {
    // read file
    if (key.toUpperCase().indexOf('TLS_FILE_') === 0) {
      const propName = snakeToCamelCase(key.toUpperCase().substring('TLS_FILE_'.length));
      secure[propName] = readFileSync(process.env[key]);
      continue;
    }

    if (key.toUpperCase().indexOf('TLS_STRING_') === 0) {
      const propName = snakeToCamelCase(key.toUpperCase().substring('TLS_STRING_'.length));
      secure[propName] = process.env[key];
      continue;
    }

    if (key.toUpperCase().indexOf('TLS_NUMBER_') === 0) {
      const propName = snakeToCamelCase(key.toUpperCase().substring('TLS_NUMBER_'.length));
      secure[propName] = +process.env[key];
      continue;
    }
  }

  return Object.keys(secure).length ? secure : undefined;
}

/**
 * Construct configuration object if not yet available
 * @returns
 */
export const getConfig = () => {
  /* istanbul ignore next */
  if (!config) {
    config = {
      licenseConsent: process.env.LICENSE_CONSENT === 'true',

      mode: (<'HTTP' | 'HTTP2'> process.env.MODE) || 'HTTP',
      secure: getSecureSettings(),

      port: parseInt(process.env.PORT || '3000'),
      hostname: process.env.HOSTNAME,
      proxyRequestTimeout: process.env.PROXY_REQUEST_TIMEOUT ? parseInt(process.env.PROXY_REQUEST_TIMEOUT) : undefined,
      logLevel: process.env.LOG_LEVEL || 'info',
      upstream: process.env.UPSTREAM_URL,

      paths: {
        health: process.env.HEALTH_PATH || '/_prxi_/health',
        logout: process.env.LOGOUT_PATH || '/_prxi_/logout',
        login: process.env.LOGIN_PATH || '/_prxi_/login',
        api: {
          whoami: process.env.WHOAMI_API_PATH,
        }
      },

      hostURL: process.env.HOST_URL,
      openid: {
        discoverURL: process.env.OPENID_CONNECT_DISCOVER_URL,
        callbackPath: process.env.OPENID_CALLBACK_PATH || '/_prxi_/callback',
        clientId: process.env.OPENID_CLIENT_ID,
        clientSecret: process.env.OPENID_CLIENT_SECRET,
        scope: process.env.OPENID_SCOPE || 'openid email profile'
      },

      headers: {
        meta: process.env.HEADERS_META,
        claims: {
          auth: {
            all: process.env.HEADERS_CLAIMS_AUTH_ALL,
            matching: process.env.HEADERS_CLAIMS_AUTH_MATCHING,
          },
          proxy: process.env.HEADERS_CLAIMS_PROXY,
        },
        request: process.env.HEADERS_INJECT_REQUEST ? JSON.parse(process.env.HEADERS_INJECT_REQUEST) : undefined,
        response: process.env.HEADERS_INJECT_RESPONSE ? JSON.parse(process.env.HEADERS_INJECT_RESPONSE) : undefined,
      },

      cookies: {
        secure: Boolean(process.env.COOKIES_SECURE || 'true'),
        proxyToUpstream: Boolean(process.env.COOKIES_PROXY_TO_UPSTREAM || 'true'),
        names: {
          accessToken: process.env.COOKIES_ACCESS_TOKEN || 'prxi-at',
          idToken: process.env.COOKIES_ID_TOKEN || 'prxi-it',
          refreshToken: process.env.COOKIES_REFRESH_TOKEN || 'prxi-rt',
          originalPath: process.env.COOKIES_ORIGINAL_PATH || 'prxi-op',
          meta: process.env.COOKIES_META || 'prxi-meta',
        }
      },

      mappings: {
        public: prepareMappings(process.env.MAPPINGS_PUBLIC),
        ws: prepareMappings(process.env.MAPPINGS_WS),
        api: prepareMappings(process.env.MAPPINGS_API),
        pages: prepareMappings(process.env.MAPPINGS_PAGES),
      },

      jwt: {
        metaTokenSecret: process.env.JWT_META_TOKEN_SECRET,
        authClaimPaths: process.env.JWT_AUTH_CLAIM_PATHS ? JSON.parse(process.env.JWT_AUTH_CLAIM_PATHS) : {},
        proxyClaimPaths: process.env.JWT_PROXY_CLAIM_PATHS ? JSON.parse(process.env.JWT_PROXY_CLAIM_PATHS) : {},
      },

      redirect: {
        pageRequest: {
          e404: process.env.REDIRECT_PAGE_REQUEST_ON_404,
          e403: process.env.REDIRECT_PAGE_REQUEST_ON_403,
          e500: process.env.REDIRECT_PAGE_REQUEST_ON_500,
          e503: process.env.REDIRECT_PAGE_REQUEST_ON_503,
        }
      },

      webhook: {
        login: process.env.WEBHOOK_LOGIN_URL,
        logout: process.env.WEBHOOK_LOGOUT_URL,
      }
    }

    if (config.secure) {
      if (config.upstream.toLowerCase().indexOf('http://') === 0) {
        throw new Error('When secure settings provided, upstream URL should be "https://*"');
      }

      if (!config.cookies.secure) {
        throw new Error('When secure settings provided, COOKIES_SECURE should be "true"');
      }
    }
  }

  return config;
}

/**
 * Get sanitized configuration
 * @returns
 */
export const getSanitizedConfig = () => {
  const mask = (value: unknown): string | undefined => {
    if (value) {
      return '*****'
    }
  }

  const config = getConfig();
  return {
    ...config,
    openid : {
      ...config.openid,
      clientSecret: mask(config.openid.clientSecret),
    },
    secure: mask(config.secure),
  }
}

/**
 * Update configuration
 * @param config
 */
export const updateConfig = (newConfig: Config): void => {
  config = newConfig;
}
