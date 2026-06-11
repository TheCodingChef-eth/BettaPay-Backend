// Shared Type Definitions for BettaPay — single source of truth for TS types

export * from '../validation/schemas.js';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];
export type ID = string;
export type Currency = string;

export const EVENT_TYPES = [
  'PaymentInitiated',
  'PaymentCompleted',
  'SettlementTriggered',
  'FXExecuted',
  'BillPaid',
  'AnchorSettled'
] as const;
