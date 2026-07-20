import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

import { OFFICIAL_FEATURE_ACCESS_KEYS } from '../../subscriptions/feature-access.constants';

const officialKeys = new Set<string>(OFFICIAL_FEATURE_ACCESS_KEYS);

export function IsFeatureAccessMap(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isFeatureAccessMap',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (
            typeof value !== 'object' ||
            Array.isArray(value) ||
            value === null
          ) {
            return false;
          }

          return Object.entries(value as Record<string, unknown>).every(
            ([key, flag]) => officialKeys.has(key) && typeof flag === 'boolean',
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} chỉ nhận key chính thức và value boolean.`;
        },
      },
    });
  };
}
