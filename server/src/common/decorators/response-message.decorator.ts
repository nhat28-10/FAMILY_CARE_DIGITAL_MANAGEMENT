import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Attaches a human-readable success message to a route handler. The
 * TransformInterceptor reads it to build the standard success envelope.
 *
 * @example
 * @ResponseMessage('Login successfully')
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
