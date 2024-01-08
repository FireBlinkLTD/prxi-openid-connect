import { Mapping } from "./Mapping";

export interface Config {
  licenseConsent: boolean;

  log: {
    level: string;
    pretty: boolean;
    file?: string;
    rotate: {
      datePattern: string,
      maxSize: string,
      maxFiles: string,
    }
  };

  mode: 'HTTP' | 'HTTP2',
  secure?: Record<string, string | number | Buffer>

  port: number;
  hostname?: string;
  proxyRequestTimeout?: number;
  upstream: string;


  paths: {
    health: string;
    logout: string;
    login: string;
    api: {
      whoami?: string;
      permissions?: string;
    }
  }

  hostURL: string;

  dynamic: {
    version: number,
    headers?: Record<string, string | string[]>,

    remote: {
      enabled: boolean;
      interval: number;
      endpoint?: string;
      token?: string;
    }

    openid: {
      discoverURL: string;
      callbackPath: string;
      clientId: string;
      clientSecret: string;
      scope: string;
    };

    mappings: {
      public: Mapping[];
      api: Mapping[];
      pages: Mapping[];
      ws: Mapping[];
    },

    jwt: {
      metaTokenSecret?: string;
      authClaimPaths: Record<string, string[]>,
      proxyClaimPaths: Record<string, string[]>;
    },
  }

  headers: {
    meta?: string;
    claims: {
      auth: {
        all?: string;
        matching: string;
      },
      proxy: string,
    },
    responseConfigVersion?: string;
    request?: Record<string, string | string[] | null>;
    response?: Record<string, string | string[] | null>;
  }

  cookies: {
    secure: boolean;
    proxyToUpstream: boolean;
    names: {
      accessToken: string;
      idToken: string;
      refreshToken: string;
      originalPath: string;
      meta: string;
    }
  },

  redirect: {
    pageRequest: {
      e404?: string;
      e403?: string;
      e500?: string;
      e503?: string;
    }
  },

  webhook: {
    login?: string;
    logout?: string;
  }
}
