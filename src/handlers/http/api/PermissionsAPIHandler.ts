import { HttpMethod, ProxyRequest, Request, Response } from "prxi";
import { Context } from "../../../types/Context";
import { getConfig } from "../../../config/getConfig";
import { RequestUtils } from "../../../utils/RequestUtils";
import { BaseAccessHandler } from "./BaseAccessHandler";
import { sendJsonResponse } from "../../../utils/ResponseUtils";
import { Mapping } from "../../../config/Mapping";

interface Resource {
  path: string;
  method: HttpMethod;
  allowed: boolean;
}

export class PermissionsAPIHandler extends BaseAccessHandler {
  /**
   * @inheritdoc
   */
  isMatching(method: HttpMethod, path: string, context: Context): boolean {
    return RequestUtils.isMatching(
      context.debugger.child('PermissionsAPIHandler -> isMatching()', {method, path}),
      // request
      method, path,
      // expected
      'POST', getConfig().paths.api.permissions,
    );
  }

  /**
   * @inheritdoc
   */
  async process(req: Request, res: Response, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context): Promise<void> {
    const _ = context.debugger.child('PermissionsAPIHandler -> process()', { context, headers: req.headers, method, path });

    // parse body
    const body: Resource[] = await RequestUtils.readJsonBody(req);

    // validate
    if (!body) {
      return sendJsonResponse(_, 400, {
        error: 'body is missing',
      }, res);
    }

    if (!Array.isArray(body)) {
      return sendJsonResponse(_, 400, {
        error: 'body is not an array',
      }, res);
    }

    for (const r of body) {
      if (!r) {
        return sendJsonResponse(_, 400, {
          error: 'one of the body array elements is missing',
        }, res);
      }

      if (!r.path) {
        return sendJsonResponse(_, 400, {
          error: 'one of the body array elements is missing "path" property',
        }, res);
      }

      if (!r.method) {
        return sendJsonResponse(_, 400, {
          error: 'one of the body array elements is missing "method" property',
        }, res);
      }
    }

    // process
    const mappings = [
      getConfig().dynamic.mappings.public,
      getConfig().dynamic.mappings.api,
      getConfig().dynamic.mappings.pages,
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
    }, res);
  }
}
