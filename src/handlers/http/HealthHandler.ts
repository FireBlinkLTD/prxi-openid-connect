import { IncomingMessage, ServerResponse } from 'node:http';
import { HttpMethod, ProxyRequest, HttpRequestHandlerConfig } from 'prxi';
import { getConfig } from '../../config/getConfig';
import { sendJsonResponse } from '../../utils/ResponseUtils';
import { Context } from '../../types/Context';

export const HealthHandler: HttpRequestHandlerConfig = {
  isMatching: (method: HttpMethod, path: string, context: Context) => {
    const _ = context.debugger.child('HealthHandler -> isMatching');
    const match = method === 'GET' && path === getConfig().healthPath;
    _.debug('Matching result', {match});

    return match;
  },

  handle: async (req: IncomingMessage, res: ServerResponse, proxyRequest: ProxyRequest, method: HttpMethod, path: string, context: Context) => {
    const _ = context.debugger.child('HealthHandler -> handle');
    await sendJsonResponse(_, 200, {success: true}, res);
  }
}
