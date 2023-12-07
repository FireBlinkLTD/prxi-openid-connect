import { IncomingMessage, ServerResponse } from "http";
import { ErrorHandler } from "prxi";
import { sendErrorResponse, sendRedirect } from "../../utils/ResponseUtils";
import getLogger from "../../Logger";
import { getConfig } from "../../config/getConfig";

export const errorHandler: ErrorHandler = async (req: IncomingMessage, res: ServerResponse, err: Error) => {
  console.log(err);
  const logger = getLogger('ErrorHandler');
  logger.child({ error: err.message }).error('Unexpected error occurred');

  let code = 500;
  let message = 'Unexpected error occurred';
  let redirectTo = getConfig().redirect.pageRequest.e500;

  if ((<any> err).code === 'ECONNREFUSED') {
    code = 503;
    message = 'Service Unavailable';
    redirectTo = getConfig().redirect.pageRequest.e503;
  }

  if (redirectTo) {
    sendRedirect(req, res, redirectTo);
    return;
  }

  await sendErrorResponse(req, code, message, res);
}

