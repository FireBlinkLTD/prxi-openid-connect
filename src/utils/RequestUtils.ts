import { parse } from "cookie";
import { IncomingMessage } from "http";

export class RequestUtils {
  /**
   * Get cookies from the incoming request
   * @param req
   * @returns
   */
  public static getCookies(req: IncomingMessage): Record<string, string> {
    /* istanbul ignore else */
    return req.headers.cookie ? parse(req.headers.cookie) : {};
  }
}
