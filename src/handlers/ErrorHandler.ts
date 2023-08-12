import { IncomingMessage, ServerResponse } from "http";
import { ErrorHandler } from "prxi";
import { sendErrorResponse } from "../utils/ResponseUtils";
import getLogger from "../Logger";

export const errorHandler: ErrorHandler = async (req: IncomingMessage, res: ServerResponse, err: Error) => {
  console.log(err);
  const logger = getLogger('ErrorHandler');
  logger.child({ error: err.message }).error('Unexpected error occurred');
  await sendErrorResponse(req, 500, 'Unexpected error occurred', res);
}

