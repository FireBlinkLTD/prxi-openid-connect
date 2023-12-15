import { parse, serialize } from "cookie";
import { IncomingHttpHeaders } from "node:http";
import { ServerHttp2Stream } from "node:http2";
import { Jwt } from "jsonwebtoken";
import { HttpMethod, Request } from "prxi";
import * as getRawBody from "raw-body";

import { Debugger } from "./Debugger";
import { Mapping } from "../config/Mapping";
import { getConfig } from "../config/getConfig";

export class RequestUtils {
  /**
   * Get cookies from the incoming request
   * @param req
   * @returns
   */
  public static getCookies(headers: IncomingHttpHeaders): Record<string, string> {
    /* istanbul ignore else */
    return headers.cookie ? parse(headers.cookie) : {};
  }

  /**
   * Prepare proxy cookies
   */
  public static prepareProxyCookies(headers: IncomingHttpHeaders, cookies: Record<string, string>): string | string[] | null {
    const config = getConfig();

    if (config.headers.request) {
      const cookieRequestHeader = Object.entries(config.headers.request).find(e => e[0].toLowerCase() === 'cookie');
      if (cookieRequestHeader) {
        return cookieRequestHeader[1];
      }
    }

    if (config.cookies.proxyToUpstream) {
      return headers.cookie || null;
    }

    const copy = {
      ...cookies,
    }

    delete copy[config.cookies.names.accessToken];
    delete copy[config.cookies.names.idToken];
    delete copy[config.cookies.names.refreshToken];
    delete copy[config.cookies.names.meta];
    delete copy[config.cookies.names.originalPath];

    const result: string[] = [];
    for (const entry of Object.entries(copy)) {
      result.push(serialize(entry[0], entry[1]));
    }

    return result.join('; ');
  }

  /**
   * Check if access is allowed
   * @param logger
   * @param accessTokenJWT
   * @param idTokenJWT
   * @param mapping
   * @returns false if access denied, object with claims when allowed
   */
  public static isAllowedAccess(
    _: Debugger,
    accessTokenJWT: Jwt,
    idTokenJWT: Jwt,
    mapping: Mapping
  ): {auth: {all: Record<string, string[]>, matching: Record<string, string[]>}, proxy: Record<string, any>} | false {
    const { authClaimPaths } = getConfig().jwt;
    const { auth } = mapping;

    const matchingAuthClaims: Record<string, string[]> = {};
    const allAuthClaims: Record<string, string[]> = {};

    const jwtClaims = RequestUtils.extractAuthJWTClaims([
      accessTokenJWT,
      idTokenJWT,
    ], authClaimPaths);

    let pass = false;
    for (const key of Object.keys(auth.claims)) {
      matchingAuthClaims[key] = [];
      const expectedKeyClaims = auth.claims[key];
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
      _.debug('Found intersection of claims, access allowed', {
        matchingAuthClaims,
      });
    }

    if (pass || !auth.required) {
      const proxy = RequestUtils.extractRawJWTClaims([
        accessTokenJWT,
        idTokenJWT,
      ], getConfig().jwt.proxyClaimPaths);

      return {
        auth: {
          all: allAuthClaims,
          matching: matchingAuthClaims,
        },
        proxy,
      };
    }

    _.info('No intersection of claims found, access denied', {
      expectedClaims: auth.claims,
      actualClaims: jwtClaims,
    });

    return false;
  }

  /**
   * Extract JWT Claims for provided paths from all provided tokens
   * @param tokens
   * @param claimPaths
   * @returns
   */
  static extractRawJWTClaims(tokens: Jwt[], claimPaths: Record<string, string[]>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const name of Object.keys(claimPaths)) {
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
            result[name] = target;
          }
        }
      }
    }

    return result;
  }

  /**
   * Extract Auth JWT Claims for provided paths from all provided tokens
   * @param tokens
   * @param claimPaths
   * @returns
   */
  static extractAuthJWTClaims(tokens: Jwt[], claimPaths: Record<string, string[]>): Record<string, string[]> {
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
            if (Array.isArray(target)) {
              claims.push(...target);
            } else {
              claims.push(target);
            }
          }
        }
      }

      result[name] = claims;
    }

    return result;
  }

  /**
   * Check if method and path matching
   * @param _
   * @param reqMethod
   * @param reqPath
   * @param expectedMethod
   * @param expectedPath
   * @returns
   */
  static isMatching(_: Debugger, reqMethod: HttpMethod, reqPath: string, expectedMethod: HttpMethod, expectedPath?: string): boolean {
    if (!expectedPath) {
      _.debug('Skipped, no path provided');

      return false;
    }

    const match = reqMethod === expectedMethod && reqPath === expectedPath;
    _.debug('Matching result', {match});

    return match;
  }

  /**
   * Check if request is matching method
   * @param debug
   * @param mappings
   * @param method
   * @param path
   * @returns
   */
  static findMapping(_: Debugger, mappings: Mapping[], method: HttpMethod, path: string): Mapping | null {
    _.debug('Looking for a match', {
      method,
      path
    });
    for (const mapping of mappings) {
      const matchMethod = !mapping.methods || mapping.methods.find(m => m === method);
      if (matchMethod && mapping.pattern.exec(path)) {
        let exclude = false;
        for (const excludeMapping of mapping.exclude) {
          const excludeMethodMatch = !mapping.methods || mapping.methods.find(m => m === method);
          const excludePatternMatch = excludeMethodMatch && excludeMapping.pattern.exec(path);
          exclude = !!excludePatternMatch;
          if (exclude) {
            continue;
          }
        }

        if (!exclude) {
          _.debug('Match found');
          return mapping;
        }
      }
    }

    _.debug('No matches found');
    return null;
  }

  /**
   * Read JSON
   * @param req
   * @param res
   * @returns
   */
  static async readJsonBody<T>(req: Request | ServerHttp2Stream): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      getRawBody(req, {
        limit: 128 * 1024,
      }, (err: Error, body: Buffer) => {
        if (err) {
          return reject(err);
        }

        let json;
        try {
          json = JSON.parse(body.toString('utf-8'))
        } catch (e) {
          return reject(e);
        }

        resolve(json);
      });
    });
  }
}
