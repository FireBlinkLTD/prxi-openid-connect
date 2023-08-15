import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { getConfig } from "../config/getConfig";
import { invalidateAuthCookies, sendRedirect } from "../utils/ResponseUtils";
import { OpenIDUtils } from "../utils/OpenIDUtils";

export const LogoutHandler: RequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string) => {
    return method === 'GET' && path === getConfig().logoutPath;
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest) => {
    invalidateAuthCookies(res);
    await sendRedirect(res, OpenIDUtils.getEndSessionUrl());
  }
}
