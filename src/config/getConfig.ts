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
      logoutPath: process.env.LOGOUT_PATH || '/_prxi_/logout',
      loginPath: process.env.LOGIN_PATH || '/_prxi_/login',

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
        names: {
          accessToken: process.env.COOKIES_ACCESS_TOKEN || 'prxi-at',
          idToken: process.env.COOKIES_ID_TOKEN || 'prxi-it',
          refreshToken: process.env.COOKIES_REFRESH_TOKEN || 'prxi-rt',
          originalPath: process.env.COOKIES_ORIGINAL_PATH || 'prxi-op',
          meta: process.env.COOKIES_META || 'prxi-meta',
        }
      },

      mappings: {
        public: prepareMappings(process.env.MAPPINGS_PUBLIC, false),
        ws: prepareMappings(process.env.MAPPINGS_WS, false),
        api: prepareMappings(process.env.MAPPINGS_API, true),
        pages: prepareMappings(process.env.MAPPINGS_PAGES, true),
      },

      jwt: {
        metaTokenSecret: process.env.JWT_META_TOKEN_SECRET,
        authClaimPaths: process.env.JWT_AUTH_CLAIM_PATHS ? JSON.parse(process.env.JWT_AUTH_CLAIM_PATHS) : {},
        proxyClaims: process.env.JWT_PROXY_CLAIMS ? process.env.JWT_PROXY_CLAIMS.split(',').map(c => c.trim()).filter(c => c.length) : [],
      },

      redirect: {
        pageRequest: {
          e404: process.env.REDIRECT_PAGE_REQUEST_ON_404,
          e403: process.env.REDIRECT_PAGE_REQUEST_ON_403,
        }
      },

      webhook: {
        login: process.env.WEBHOOK_LOGIN_URL,
        logout: process.env.WEBHOOK_LOGOUT_URL,
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
