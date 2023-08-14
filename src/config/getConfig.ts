import { prepareMappings } from "./Mapping";
import { Config } from "./Config";

let config: Config;

/**
 * Construct configuration object if not yet available
 * @returns
 */
export const getConfig = () => {
  /* istanbul ignore next */
  if (!config) {
    config = {
      port: parseInt(process.env.PORT || '3000'),
      hostname: process.env.HOSTNAME,
      proxyRequestTimeout: process.env.PROXY_REQUEST_TIMEOUT ? parseInt(process.env.PROXY_REQUEST_TIMEOUT) : undefined,
      logLevel: process.env.LOG_LEVEL || 'info',
      upstream: process.env.UPSTREAM_URL,
      healthPath: process.env.HEALTH_PATH || '/_prxi_/health',

      hostURL: process.env.HOST_URL,
      openid: {
        discoverURL: process.env.OPENID_CONNECT_DISCOVER_URL,
        callbackPath: process.env.OPENID_CALLBACK_PATH || '/_prxi_/callback',
        clientId: process.env.OPENID_CLIENT_ID,
        clientSecret: process.env.OPENID_CLIENT_SECRET,
        scope: process.env.OPENID_SCOPE || 'openid email profile'
      },

      cookies: {
        secure: Boolean(process.env.COOKIES_SECURE || 'true'),
        names: {
          accessToken: process.env.COOKIES_ACCESS_TOKEN || 'prxi-at',
          idToken: process.env.COOKIES_ID_TOKEN || 'prxi-it',
          refreshToken: process.env.COOKIES_REFRESH_TOKEN || 'prxi-rt',
          originalPath: process.env.COOKIES_ORIGINAL_PATH || 'prxi-op',
        }
      },

      mappings: {
        public: prepareMappings(process.env.MAPPINGS_PUBLIC, false),
        api: prepareMappings(process.env.MAPPINGS_API, true),
        pages: prepareMappings(process.env.MAPPINGS_PAGES, true),
      },

      jwt: {
        claimPaths: process.env.JWT_CLAIM_PATHS ? JSON.parse(process.env.JWT_CLAIM_PATHS) : {},
      },

      redirect: {
        pageRequest: {
          e404: process.env.REDIRECT_PAGE_REQUEST_ON_404,
          e403: process.env.REDIRECT_PAGE_REQUEST_ON_403,
        }
      },

      webhook: {
        login: process.env.WEBHOOK_LOGIN_URL
      }
    }
  }

  return config;
}

/**
 * Update configuration
 * @param config
 */
export const updateConfig = (newConfig: Config): void => {
  config = newConfig;
}