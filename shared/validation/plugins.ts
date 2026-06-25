import { FastifyInstance, FastifyError, FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { createErrorResponse, ErrorCodes } from './index.js';

export function registerErrorHandler(fastify: FastifyInstance, customLogger?: FastifyBaseLogger) {
  fastify.setErrorHandler((error, request, reply) => {
    const logger = customLogger || request.log || fastify.log;

    if (error instanceof z.ZodError) {
      const response = createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid request data', error.errors);
      return reply.code(400).send(response);
    }

    if ((error as FastifyError).statusCode) {
      const fastifyErr = error as FastifyError;
      // Use the attached status code. Preserve the safe message.
      const code = fastifyErr.code || ErrorCodes.INVALID_REQUEST;
      const response = createErrorResponse(code, fastifyErr.message);
      return reply.code(fastifyErr.statusCode!).send(response);
    }

    // Generic fallback for unhandled errors
    logger.error({ err: error, reqId: request.id }, 'Unhandled internal error');
    
    // In production, do not leak stack traces or internal details
    const response = createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Internal server error');
    return reply.code(500).send(response);
  });
}
