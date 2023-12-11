import { Jwt } from "jsonwebtoken";
import { Mapping } from "../config/Mapping";
import { Debugger } from "../utils/Debugger";

export interface Context {
  requestId: string;
  debugger: Debugger;

  // ws proxy handler
  wsMapping: Mapping,

  //
  accessToken?: string,
  accessTokenJWT?: Jwt,
  idToken?: string,
  idTokenJWT?: Jwt,
  refreshToken?: string,

  // proxy handler specific
  mapping?: Mapping;
  public?: boolean;
  api?: boolean;
  page?: boolean;
  claims?: {
    auth: {
      all: Record<string, string[]>,
      matching: Record<string, string[]>
    },
    proxy: Record<string, any>
  }
}
