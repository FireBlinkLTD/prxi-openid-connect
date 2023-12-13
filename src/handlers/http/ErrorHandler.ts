import { IncomingMessage, ServerResponse } from 'node:http';
import { ErrorHandler } from 'prxi';
import { sendErrorResponse, sendRedirect } from '../../utils/ResponseUtils';
import { getConfig } from '../../config/getConfig';
import { Context } from '../../types/Context';

export const errorHandler: ErrorHandler = async (req: IncomingMessage, res: ServerResponse, err: Error, context: Context) => {
  const _ = context.debugger.child('errorHandler');

  console.log(err);
  _.error('Unexpected error occurred', err);

  let code = 500;
  let message = 'Unexpected error occurred';
  let redirectTo = getConfig().redirect.pageRequest.e500;

  if ((<any> err).code === 'ECONNREFUSED') {
    code = 503;
    message = 'Service Unavailable';
    redirectTo = getConfig().redirect.pageRequest.e503;
  }

  if (redirectTo) {
    sendRedirect(_, req, res, redirectTo);
    return;
  }

  await sendErrorResponse(_, req, code, message, res);
}

