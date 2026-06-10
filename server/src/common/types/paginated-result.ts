/**
 * Standard shape for a paginated list response (wrapped by TransformInterceptor
 * into the success envelope as `data`).
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Builds a PaginatedResult from a page of items and the total count. */
export function buildPaginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    limit,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

/** Computes the Prisma `skip` offset from page/limit. */
export function skipFor(page: number, limit: number): number {
  return (page - 1) * limit;
}
