export const DYNAMIC_RESPONSE_MESSAGE_KEY = '__responseMessage';

export interface DynamicResponse<T> {
  [DYNAMIC_RESPONSE_MESSAGE_KEY]: string;
  data: T;
}

export const withResponseMessage = <T>(
  message: string,
  data: T,
): DynamicResponse<T> => ({
  [DYNAMIC_RESPONSE_MESSAGE_KEY]: message,
  data,
});

export const isDynamicResponse = <T>(
  value: unknown,
): value is DynamicResponse<T> =>
  Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>)[DYNAMIC_RESPONSE_MESSAGE_KEY] ===
      'string' &&
    Object.prototype.hasOwnProperty.call(value, 'data'),
  );
