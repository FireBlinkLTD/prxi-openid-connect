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
  public static isAllowedAccess(logger: Logger, accessTokenJWT: Jwt, idTokenJWT: Jwt, mapping: Mapping, noClaimsAllowedAccess = false): {auth: {all: Record<string, string[]>, matching: Record<string, string[]>}, proxy: Record<string, any>} | false {
    const { authClaimPaths } = getConfig().jwt;
    const { claims } = mapping;

    const matchingAuthClaims: Record<string, string[]> = {};
    const allAuthClaims: Record<string, string[]> = {};

    const jwtClaims = RequestUtils.extractJWTClaims([
      accessTokenJWT,
      idTokenJWT,
    ], authClaimPaths);

    if (!claims) {
      if (noClaimsAllowedAccess) {
        logger.child({mapping}).debug('No claims found, access allowed');
        return {
          auth: {
            all: {},
            matching: {}
          },
          proxy: {},
        };
      }

      logger.child({mapping}).warn('Unable to find claims in the mapping');
      return false;
    }



    let pass = false;
    for (const key of Object.keys(claims)) {
      matchingAuthClaims[key] = [];
      const expectedKeyClaims = claims[key];
      const jwtKeyClaims = allAuthClaims[key] = jwtClaims[key];

      if (jwtKeyClaims?.length) {
        const intersection = expectedKeyClaims.filter(claim => jwtKeyClaims.includes(claim));
        if (intersection.length) {
          matchingAuthClaims[key] = intersection;
          pass = true;
        }
      }
    }

    if (pass) {
      logger.child({matchingAuthClaims}).info('Found intersection of claims, access allowed');
      return {
        auth: {
          all: allAuthClaims,
          matching: matchingAuthClaims,
        },
        proxy: {}
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
