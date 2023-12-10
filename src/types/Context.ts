import { Mapping } from "../config/Mapping";
import { Debugger } from "../utils/Debugger";

export interface Context {
  requestId: string;
  debugger: Debugger;

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
