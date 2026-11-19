// Shared Type Definitions for BettaPay — single source of truth for TS types

import type { ErrorResponse } from '@bettapay/validation';
export * from '@bettapay/validation';
export type {
  HealthStatus,
  DependencyConnectionStatus,
  DependencyHealth,
  HealthResponse,
  ServiceHealthSnapshot,
  AggregatedHealthResponse,
} from '@bettapay/validation';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
export type ID = string;
export type Currency = string;
/** Arbitrary-precision decimal amount encoded as a numeric string, e.g. "1500.50". */
declare const amountBrand: unique symbol;
export type Amount = string & { readonly [amountBrand]: 'Amount' };
export const AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/;
export function isAmount(value: unknown): value is Amount { return typeof value === 'string' && AMOUNT_PATTERN.test(value); }
export function parseAmount(value: string): Amount {
  if (!isAmount(value)) throw new TypeError('Amount must be an unsigned decimal string');
  return value;
}
/**
 * Like parseAmount, but rejects zero ("0", "0.00") for fields that must be
 * strictly positive (payment/settlement amounts).  Negative values are already
 * rejected by AMOUNT_PATTERN.  The check is done on the digits rather than via
 * Number() so arbitrarily precise amounts aren't rounded to zero.
 */
export function parsePositiveAmount(value: string): Amount {
  const amount = parseAmount(value);
  if (!/[1-9]/.test(amount)) throw new TypeError('Amount must be greater than zero');
  return amount;
}
/** Integer Stellar stroop amount encoded as a string, e.g. "15005000000". */
export type Stroops = string;

// Shared API response envelope
export type ApiResponse<T> =
  | { data: T }
  | { error: ErrorResponse };

// Paginated response wrapper
export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: PaginationMeta;
};

// Single source of truth for computing pagination metadata so every list
// endpoint (settlements, events, audit log, ...) reports identical semantics.
// Inputs are clamped (page >= 1, limit >= 1, total >= 0, all integers) so a
// bad query string or count can never yield negative totalPages or flags that
// contradict each other.
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const normalizedPage = clampInteger(page, 1);
  const normalizedLimit = clampInteger(limit, 1);
  const normalizedTotal = clampInteger(total, 0);
  const totalPages = normalizedTotal === 0 ? 0 : Math.ceil(normalizedTotal / normalizedLimit);
  return {
    page: normalizedPage,
    limit: normalizedLimit,
    total: normalizedTotal,
    totalPages,
    hasNext: normalizedTotal > 0 && normalizedPage < totalPages,
    hasPrev: normalizedPage > 1,
  };
}

function clampInteger(value: number, min: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.floor(value)) : min;
}
