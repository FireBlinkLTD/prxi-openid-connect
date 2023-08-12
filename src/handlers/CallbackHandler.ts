import { IncomingMessage, ServerResponse } from "http";
import { HttpMethod, ProxyRequest, RequestHandlerConfig } from "prxi";
import { getConfig } from "../ServerConfig";
import { sendRedirect, setAuthCookies, setCookies } from "../utils/ResponseUtils";
import { OpenIDUtils } from "../utils/OpenIDUtils";
import { parse } from "cookie";

export const CallbackHandler: RequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string) => {
    return method === 'GET' && path === getConfig().openid.callbackPath;
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest) => {
    const tokens = await OpenIDUtils.exchangeCode(req);
    setAuthCookies(res, tokens);

    const cookies = parse(req.headers.cookie);
    const originalPath = cookies[getConfig().cookies.names.originalPath] || '/';
    await sendRedirect(res, `${getConfig().hostURL}${originalPath}`);
  }
}
