import { Mapping } from "./Mapping";

export interface Config {
  port: number;
  hostname?: string;
  proxyRequestTimeout?: number;
  logLevel: string;
  upstream: string;

  healthPath: string;
  logoutPath: string;

  hostURL: string;
  openid: {
    discoverURL: string;
    callbackPath: string;
    clientId: string;
    clientSecret: string;
    scope: string;
  };

  headers: {
    meta?: string;
    claims: {
      all?: string;
      matching: string;
    },
    request?: Record<string, string | string[] | null>;
    response?: Record<string, string | string[] | null>;
  }

  cookies: {
    secure: boolean;
    names: {
      accessToken: string;
      idToken: string;
      refreshToken: string;
      originalPath: string;
      meta: string;
    }
  },

  mappings: {
    public: Mapping[];
    api: Mapping[];
    pages: Mapping[];
  },

  jwt: {
    metaTokenSecret?: string;
    claimPaths: Record<string, string[]>,
  },

  redirect: {
    pageRequest: {
      e404?: string;
      e403?: string;
    }
  },

  webhook: {
    login?: string;
    logout?: string;
  }
}
