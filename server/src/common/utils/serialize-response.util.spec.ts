import { Prisma } from '@prisma/client';

import { serializeResponse } from './serialize-response.util';

describe('serializeResponse', () => {
  it('converts Decimal values at the top level of an object', () => {
    expect(
      serializeResponse({
        annualPrice: new Prisma.Decimal('99000.00'),
      }),
    ).toEqual({
      annualPrice: 99000,
    });
  });

  it('converts Decimal values in nested objects', () => {
    expect(
      serializeResponse({
        location: {
          latitude: new Prisma.Decimal('10.7626220'),
        },
      }),
    ).toEqual({
      location: {
        latitude: 10.762622,
      },
    });
  });

  it('converts Decimal values in arrays', () => {
    expect(
      serializeResponse([
        new Prisma.Decimal('0.25'),
        { targetAmount: new Prisma.Decimal('30000000.00') },
      ]),
    ).toEqual([0.25, { targetAmount: 30000000 }]);
  });

  it('converts Decimal values in paginated response items', () => {
    expect(
      serializeResponse({
        items: [
          {
            plannedAmount: new Prisma.Decimal('99000.00'),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    ).toEqual({
      items: [
        {
          plannedAmount: 99000,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('keeps Date instances as Date objects', () => {
    const createdAt = new Date('2026-07-13T00:00:00.000Z');

    const result = serializeResponse({ createdAt });

    expect(result.createdAt).toBe(createdAt);
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('does not change null, undefined, numeric strings, booleans, enums, or numbers', () => {
    expect(
      serializeResponse({
        nullValue: null,
        undefinedValue: undefined,
        numericString: '99000.00',
        booleanValue: true,
        enumValue: 'APPROVED',
        numberValue: 42,
      }),
    ).toEqual({
      nullValue: null,
      undefinedValue: undefined,
      numericString: '99000.00',
      booleanValue: true,
      enumValue: 'APPROVED',
      numberValue: 42,
    });
  });

  it('does not mutate the input object', () => {
    const annualPrice = new Prisma.Decimal('99000.00');
    const latitude = new Prisma.Decimal('10.7626220');
    const input = {
      annualPrice,
      nested: {
        latitude,
      },
    };

    const result = serializeResponse(input);

    expect(result).toEqual({
      annualPrice: 99000,
      nested: {
        latitude: 10.762622,
      },
    });
    expect(result).not.toBe(input);
    expect(result.nested).not.toBe(input.nested);
    expect(input.annualPrice).toBe(annualPrice);
    expect(input.nested.latitude).toBe(latitude);
  });
});
