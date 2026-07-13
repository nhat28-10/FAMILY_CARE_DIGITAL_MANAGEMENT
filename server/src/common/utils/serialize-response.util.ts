import { Prisma } from '@prisma/client';

type SerializableObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is SerializableObject => {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const serializeValue = (value: unknown, seen: WeakMap<object, unknown>) => {
  if (value == null) {
    return value;
  }

  if (Prisma.Decimal.isDecimal(value)) {
    return value.toNumber();
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }

    const serialized: unknown[] = [];
    seen.set(value, serialized);
    serialized.push(...value.map((item) => serializeValue(item, seen)));
    return serialized;
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }

    const serialized: SerializableObject = {};
    seen.set(value, serialized);
    for (const [key, propertyValue] of Object.entries(value)) {
      serialized[key] = serializeValue(propertyValue, seen);
    }
    return serialized;
  }

  return value;
};

export const serializeResponse = <T>(value: T): T =>
  serializeValue(value, new WeakMap<object, unknown>()) as T;
