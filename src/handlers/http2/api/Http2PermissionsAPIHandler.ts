import { HttpMethod, ProxyRequest } from "prxi";
import { Context } from "../../../types/Context";
import { getConfig } from "../../../config/getConfig";
import { RequestUtils } from "../../../utils/RequestUtils";
import { Http2BaseAccessHandler } from "./Http2BaseAccessHandler";
import { sendJsonResponse } from "../../../utils/Http2ResponseUtils";
import { Mapping } from "../../../config/Mapping";
import { IncomingHttpHeaders, ServerHttp2Stream } from "http2";
import { prepareSetCookies } from "../../../utils/ResponseUtils";

interface Resource {
  path: string;
  method: HttpMethod;
  allowed: boolean;
}

export class Http2PermissionsAPIHandler extends Http2BaseAccessHandler {
  /**
   * @inheritdoc
   */
  isMatching(method: HttpMethod, path: string, context: Context): boolean {
    return RequestUtils.isMatching(
      context.debugger.child('Http2PermissionsAPIHandler -> isMatching()', {method, path}),
      // request
      method, path,
      // expected
      'POST', getConfig().paths.api.permissions,
    );
  }

  /**
   * @inheritdoc
   */
  async process(
    stream: ServerHttp2Stream,
    headers: IncomingHttpHeaders,
    proxyRequest: ProxyRequest,
    method: HttpMethod,
    path: string,
    context: Context,
    cookiesToSet?: Record<string, {value: string, expires?: Date}>
  ): Promise<void> {
    const _ = context.debugger.child('Http2PermissionsAPIHandler -> process()', { context, headers, method, path });

    // parse body
    const body: Resource[] = await RequestUtils.readJsonBody(stream);

    // validate
    if (!body) {
      return sendJsonResponse(_, 400, {
        error: 'body is missing',
      }, stream, {
        'Set-Cookie': prepareSetCookies(cookiesToSet)
      });
    }

    if (!Array.isArray(body)) {
      return sendJsonResponse(_, 400, {
        error: 'body is not an array',
      }, stream, {
        'Set-Cookie': prepareSetCookies(cookiesToSet)
      });
    }

    for (const r of body) {
      if (!r) {
        return sendJsonResponse(_, 400, {
          error: 'one of the body array elements is missing',
        }, stream, {
          'Set-Cookie': prepareSetCookies(cookiesToSet)
        });
      }

      if (!r.path) {
        return sendJsonResponse(_, 400, {
          error: 'one of the body array elements is missing "path" property',
        }, stream, {
          'Set-Cookie': prepareSetCookies(cookiesToSet)
        });
      }

      if (!r.method) {
        return sendJsonResponse(_, 400, {
          error: 'one of the body array elements is missing "method" property',
        }, stream, {
          'Set-Cookie': prepareSetCookies(cookiesToSet)
        });
      }
    }

    // process
    const mappings = [
      getConfig().mappings.public,
      getConfig().mappings.api,
      getConfig().mappings.pages,
    ];

    const resources: Resource[] = [];
    for (const r of body) {
      let mapping: Mapping;
      for (let m of mappings) {
        mapping = RequestUtils.findMapping(
          _,
          m,
          r.method,
          r.path
        );

        if (mapping) {
          break;
        }
      }

      let allowed = !!mapping;
      if (allowed) {
        allowed = !!RequestUtils.isAllowedAccess(
          _.child('RequestUtils'),
          context.accessTokenJWT,
          context.idTokenJWT,
          mapping,
        );
      }

      resources.push({
        method: r.method,
        path: r.path,
        allowed,
      });
    }

    await sendJsonResponse(_, 200, {
      anonymous: !context.accessTokenJWT,
      resources,
    }, stream, {
      'Set-Cookie': prepareSetCookies(cookiesToSet)
    });
  }
}
