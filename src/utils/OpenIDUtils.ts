import { Issuer, Client, TokenSet } from "openid-client";
import getLogger from "../Logger";
import { getConfig } from "../config/getConfig";
import { IncomingMessage } from "node:http";
import jwkToBuffer = require('jwk-to-pem');
import { Jwt, verify, sign, decode } from "jsonwebtoken";
import { Logger } from "winston";
import { Debugger } from "./Debugger";

export enum JWTVerificationResult {
  MISSING = -1,
  SUCCESS = 0,
  FAILURE = 1,
  EXPIRED = 2
}

export class OpenIDUtils {
  private static logger: Logger;
  private static client: Client;
  private static issuer: Issuer;
  private static jwksKeys: Record<string, string>;

  private static refreshMap = new Map<string, Promise<TokenSet>>;

  /**
   * Init OpenID Utils
   */
  static async init(): Promise<void> {
    const logger = OpenIDUtils.logger = getLogger('OpenIDUtils');
    logger.child({
      configuration: getConfig().dynamic.openid
    }).debug('Init OpenID Utils');

    OpenIDUtils.issuer = await Issuer.discover(getConfig().dynamic.openid.discoverURL);
    OpenIDUtils.client = new OpenIDUtils.issuer.Client({
      client_id: getConfig().dynamic.openid.clientId,
      client_secret: getConfig().dynamic.openid.clientSecret,
      redirect_uris: [OpenIDUtils.getRedirectURL()],
      response_types: ['code'],
    });

    await OpenIDUtils.updateKeys();
  }

  /**
   * Parse and verify token
   */
  static async parseTokenAndVerify(token: string): Promise<{jwt: Jwt, verificationResult: JWTVerificationResult}> {
    let jwt: Jwt;
    let verificationResult: JWTVerificationResult = JWTVerificationResult.MISSING;

    if (token) {
      jwt = decode(token, {
        complete: true,
      });
      verificationResult = await OpenIDUtils.verifyJWT(token, jwt);
    }

    return {
      jwt,
      verificationResult
    }
  }

  /**
   * Update keys
   */
  static async updateKeys(): Promise<void> {
    OpenIDUtils.logger.info('Pulling well known jwks keys');

    const uri = OpenIDUtils.issuer.metadata.jwks_uri;
    const res = await fetch(uri);
    if (!res.ok) {
      throw new Error('Unable to pull jwks keys');
    }

    const { keys } = await res.json();
    const jwksKeys: Record<string, string> = {};

    for (const key of keys) {
      jwksKeys[key.kid] = jwkToBuffer(key);
    }

    OpenIDUtils.jwksKeys = jwksKeys;
  }

  /**
   * Verify JWT token
   * @param token
   * @param jwt
   * @returns
   */
  public static async verifyJWT(token: string, jwt: Jwt): Promise<JWTVerificationResult> {
    OpenIDUtils.logger.debug('Verifying JWT');

    let key = OpenIDUtils.jwksKeys[jwt.header.kid];
    if (!key) {
      await OpenIDUtils.updateKeys();
    }
    key = OpenIDUtils.jwksKeys[jwt.header.kid];
    if (!key) {
      OpenIDUtils.logger.child({
        kid: jwt.header.kid,
      }).error('Unable to validate token');

      return JWTVerificationResult.FAILURE;
    }

    try {
      verify(token, key, {
        issuer: OpenIDUtils.issuer.metadata.issuer,
      });

      OpenIDUtils.logger.debug('JWT is valid');
      return JWTVerificationResult.SUCCESS;
    } catch(e) {
      if (e.name === 'TokenExpiredError') {
        OpenIDUtils.logger.debug('JWT expired');
        return JWTVerificationResult.EXPIRED;
      }

      OpenIDUtils.logger.child({
        error: e,
        token: jwt,
      }).warn('JWT failed validation');
      return JWTVerificationResult.FAILURE;
    }
  }

  /**
   * Prepare JWT with meta payload
   * @param payload
   * @returns
   */
  public static prepareMetaToken(payload: Record<string, any>): string {
    if (!getConfig().dynamic.jwt.metaTokenSecret) {
      OpenIDUtils.logger.error('JWT_META_TOKEN_SECRET environment variable is not provided, could not generate custom user attributes JWT for provided metadata');
      throw new Error('JWT_META_TOKEN_SECRET configuration is missing');
    }

    return sign({p: payload}, getConfig().dynamic.jwt.metaTokenSecret, {
      expiresIn: '5y'
    });
  }

  /**
   * Refresh tokens
   * @param _
   * @param refreshToken
   * @returns
   */
  public static async refreshTokens(_: Debugger, refreshToken: string): Promise<TokenSet> {
    let tokenSetPromise = OpenIDUtils.refreshMap.get(refreshToken);
    if (tokenSetPromise) {
      _.debug('Awaiting refresh tokens from the cache map');
      return await tokenSetPromise;
    }

    _.debug('Refreshing tokens');
    tokenSetPromise = OpenIDUtils.client.refresh(refreshToken);
    OpenIDUtils.refreshMap.set(refreshToken, tokenSetPromise);

    setTimeout(() => {
      OpenIDUtils.refreshMap.delete(refreshToken);
    }, 10000);

    return await tokenSetPromise;
  }

  /**
   * Get redirect URL
   * @returns
   */
  private static getRedirectURL(): string {
    return `${getConfig().hostURL}${getConfig().dynamic.openid.callbackPath}`;
  }

  /**
   * Exchange Code
   * @param req
   * @returns
   */
  static async exchangeCode(req: Partial<IncomingMessage>): Promise<TokenSet> {
    const params = OpenIDUtils.client.callbackParams(<IncomingMessage> req);
    return await OpenIDUtils.client.callback(OpenIDUtils.getRedirectURL(), params);
  }

  /**
   * Get "authorization" URL
   * @returns
   */
  static getAuthorizationUrl(): string {
    return OpenIDUtils.client.authorizationUrl({
      scope: 'openid email profile',
    });
  }

  /**
   * Get "end session" URL
   * @returns
   */
  static getEndSessionUrl(): string {
    return OpenIDUtils.client.endSessionUrl({
      post_logout_redirect_uri: getConfig().hostURL,
    });
  }
}
