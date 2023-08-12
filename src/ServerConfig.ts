import { HttpMethod } from "prxi";

export interface Mapping {
  pattern: RegExp;
  methods?: HttpMethod[];
  claims?: Record<string, string[]>;
}


/**
 * Prepare mappings file from the environment variable value
 * @param value
 * @param requireClaims
 * @returns
 */
const prepareMappings = (value: string, requireClaims: boolean): Mapping[] => {
  const result: Mapping[] = [];
  if (value) {
    const json = JSON.parse(value);
    for (const r of json) {
      if (!r.pattern) {
        throw new Error(`Unable to parse mappings for value: ${value}`);
      }

      // add leading ^ character if missing to the pattern
      if (r.pattern.indexOf('^') !== 0) {
        r.pattern = '^' + r.pattern;
      }

      // add trailing $ character if missing to the pattern
      if (!r.pattern.endsWith('$')) {
        r.pattern = r.pattern + '$';
      }

      result.push({
        pattern: new RegExp(r.pattern, 'i'),
        methods: r.methods?.map((m: string) => m.toUpperCase()),
        claims: requireClaims ? r.claims : undefined,
      });

      if (requireClaims && !r.claims) {
        throw new Error(`restrictTo configuration is missing for value: ${value}`);
      }
    }
  }


  return result;
}

interface ServerConfig {
  port: number;
  hostname?: string;
  proxyRequestTimeout?: number;
  logLevel: string;
  upstream: string;
  healthPath: string;

  hostURL: string;
  openid: {
    discoverURL: string;
    callbackPath: string;
    clientId: string;
    clientSecret: string;
    scope: string;
  };

  cookies: {
    secure: boolean;
    names: {
      accessToken: string;
      idToken: string;
      refreshToken: string;
      originalPath: string;
    }
  },

  mappings: {
    public: Mapping[];
    api: Mapping[];
    pages: Mapping[];
  },

  jwt: {
    claimPaths: Record<string, string[]>,
  }
}

let config: ServerConfig;

/**
 * Construct configuration object
 * @returns
 */
export const getConfig = () => {
  if (!config) {
    config = {
      port: parseInt(process.env.PORT || '3000'),
      hostname: process.env.HOSTNAME ?? undefined,
      proxyRequestTimeout: process.env.PROXY_REQUEST_TIMEOUT ? parseInt(process.env.PROXY_REQUEST_TIMEOUT) : undefined,
      logLevel: process.env.LOG_LEVEL || 'info',
      upstream: process.env.UPSTREAM_URL,
      healthPath: process.env.HEALTH_PATH || '/_prxi_/health',

      hostURL: process.env.HOST_URL,
      openid: {
        discoverURL: process.env.OPENID_CONNECT_DISCOVER_URL,
        callbackPath: process.env.OPENID_CALLBACK_PATH,
        clientId: process.env.OPENID_CLIENT_ID,
        clientSecret: process.env.OPENID_CLIENT_SECRET,
        scope: process.env.OPENID_SCOPE || 'openid email profile'
      },

      cookies: {
        secure: Boolean(process.env.COOKIES_SECURE || 'true'),
        names: {
          accessToken: process.env.COOKIES_ACCESS_TOKEN || 'prxi-at',
          idToken: process.env.COOKIES_ACCESS_TOKEN || 'prxi-it',
          refreshToken: process.env.COOKIES_ACCESS_TOKEN || 'prxi-rt',
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
      }
    }
  }

  return config;
}
