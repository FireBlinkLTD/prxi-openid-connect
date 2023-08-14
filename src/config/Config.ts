import { Mapping } from "./Mapping";

export interface Config {
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
  },

  redirect: {
    pageRequest: {
      e404?: string;
      e403?: string;
    }
  },

  webhook: {
    login?: string;
  }
}