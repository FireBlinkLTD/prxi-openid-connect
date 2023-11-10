import { parse } from "cookie";
import { IncomingMessage } from "http";
import { Mapping } from "../config/Mapping";
import { getConfig } from "../config/getConfig";
import { Logger } from "pino";
import { Jwt } from "jsonwebtoken";

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

  /**
   * Check if access is allowed
   * @param logger
   * @param accessTokenJWT
   * @param idTokenJWT
   * @param mapping
   * @param noClaimsAllowedAccess - when true and no claims provided in mapping access will be allowed, in else case denied
   * @returns false if access denied, object with claims when allowed
   */
  public static isAllowedAccess(logger: Logger, accessTokenJWT: Jwt, idTokenJWT: Jwt, mapping: Mapping, noClaimsAllowedAccess = false): {all: Record<string, string[]>, matching: Record<string, string[]>} | false {
    const { claimPaths } = getConfig().jwt;
    const { claims } = mapping;

    const matchingClaims: Record<string, string[]> = {};
    const allClaims: Record<string, string[]> = {};

    if (!claims) {
      if (noClaimsAllowedAccess) {
        logger.child({mapping}).debug('No claims found, access allowed');
        return {
          all: {},
          matching: {}
        };
      }

      logger.child({mapping}).warn('Unable to find claims in the mapping');
      return false;
    }

    const jwtClaims = RequestUtils.extractJWTClaims([
      accessTokenJWT,
      idTokenJWT,
    ], claimPaths);

    let pass = false;
    for (const key of Object.keys(claims)) {
      matchingClaims[key] = [];
      const expectedKeyClaims = claims[key];
      const jwtKeyClaims = allClaims[key] = jwtClaims[key];

      if (jwtKeyClaims?.length) {
        const intersection = expectedKeyClaims.filter(claim => jwtKeyClaims.includes(claim));
        if (intersection.length) {
          matchingClaims[key] = intersection;
          pass = true;
        }
      }
    }

    if (pass) {
      logger.child({matchingClaims}).info('Found intersection of claims, access allowed');
      return {
        all: allClaims,
        matching: matchingClaims,
      };
    }

    logger.child({
      expectedClaims: claims,
      actualClaims: jwtClaims,
    }).info('No intersection of claims found, access forbidden');
    return false;
  }

  /**
   * Extract JWT Claims for paths from all tokens
   * @param tokens
   * @param claimPaths
   * @returns
   */
  private static extractJWTClaims(tokens: Jwt[], claimPaths: Record<string, string[]>): Record<string, string[]> {
    const result: Record<string, string[]> = {};

    for (const name of Object.keys(claimPaths)) {
      const claims: string[] = [];
      const claimPath = claimPaths[name];

      for (const jwt of tokens) {
        if (jwt) {
          let target: any = jwt.payload;
          let fail = false;
          for (let path of claimPath) {
            if (target[path]) {
              target = target[path];
            } else {
              fail = true;
              break;
            }
          }

          if (!fail) {
            claims.push(...target);
          }
        }
      }

      result[name] = claims;
    }

    return result;
  }
}
