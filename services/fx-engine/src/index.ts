/**
 * FX Engine — BettaPay Backend
 *
 * Provides exchange rate quotes for currency pairs.
 * Rates are fetched from an external API at a configurable interval and
 * cached in memory with a TTL. Hardcoded defaults serve as fallback.
 *
 * Endpoints:
 *   GET /api/rates               — latest cached rates with cache metadata
 *   GET /api/currencies          — list of supported currency codes
 *   GET /api/quote?from=&to=&amount= — FX quote
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { validateEnv, registerErrorHandler, createErrorResponse, ErrorCodes } from '@bettapay/validation';

const env = validateEnv(process.env);
const PORT = Number(process.env.PORT ?? '3002');

// ── Fallback / seed rates (issue #47) ──────────────────────────────────────
// Used on first startup before the external API responds, and whenever the
// API is unreachable so the service degrades gracefully.

const FALLBACK_RATES: Record<string, number> = {
  USDC: 1545.50,
  EURT: 1680.20,
  NGN:  1.0,
};

const CURRENCY_DISPLAY_NAMES: Record<string, string> = {
  USDC: 'USD Coin',
  EURT: 'Euro Tether',
  NGN:  'Nigerian Naira',
};

// ── In-memory rate cache (issues #47 & #48) ────────────────────────────────

interface RateCache {
  rates: Record<string, number>;
  cachedAt: number; // Unix ms timestamp
}

let cache: RateCache = {
  rates:    { ...FALLBACK_RATES },
  cachedAt: Date.now(),
};

// ── Supported currencies (issue #49) ──────────────────────────────────────
// Derived from the fallback seed; stays stable even when live rates contain
// unexpected keys, keeping the set of accepted currencies predictable.

export const SUPPORTED_CURRENCIES: string[] = Object.keys(FALLBACK_RATES);

// ── CoinGecko response schema (issue #47) ─────────────────────────────────

const CoinGeckoSchema = z.object({
  'usd-coin':    z.object({ ngn: z.number() }).optional(),
  'tether-eurt': z.object({ ngn: z.number() }).optional(),
});

/**
 * Fetch fresh rates from the configured external API.
 * Returns a new rates object or throws on failure.
 */
async function fetchRates(): Promise<Record<string, number>> {
  const response = await fetch(env.RATES_API_URL);
  if (!response.ok) {
    throw new Error(`Rates API responded with HTTP ${response.status}`);
  }
  const json = await response.json();
  const parsed = CoinGeckoSchema.parse(json);

  return {
    USDC: parsed['usd-coin']?.ngn    ?? FALLBACK_RATES.USDC,
    EURT: parsed['tether-eurt']?.ngn ?? FALLBACK_RATES.EURT,
    NGN:  1.0,
  };
}

/**
 * Refresh the cache only when the TTL has expired (issue #48).
 * On failure, logs the error and keeps the last-known-good rates.
 */
async function refreshRatesIfStale(): Promise<void> {
  const ageMs = Date.now() - cache.cachedAt;
  if (ageMs < env.RATES_CACHE_TTL_MS) {
    return; // still fresh
  }

  try {
    const fresh = await fetchRates();
    cache = { rates: fresh, cachedAt: Date.now() };
    console.info('[fx-engine] rates refreshed from external API');
  } catch (err) {
    console.error('[fx-engine] rate refresh failed — keeping last known rates:', err);
  }
}

// Kick off a background polling loop at startup (issue #47).
setInterval(refreshRatesIfStale, env.RATES_REFRESH_INTERVAL_MS);
// Also attempt an immediate first fetch so the service starts with live rates.
refreshRatesIfStale().catch(() => {});

// ── Fastify setup ──────────────────────────────────────────────────────────

const fastify = Fastify({ logger: true });

// CORS
fastify.register(cors, {
  origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
});

// Rate limiting — global 1000 req/min, stricter on /api/quote (issue #50)
fastify.register(rateLimit, {
  global:     true,
  max:        1000,
  timeWindow: 60 * 1000,
  errorResponseBuilder: (_req, context) => ({
    error: {
      code:    'RATE_LIMIT_EXCEEDED',
      message: `Too many requests — rate limit is ${context.max} requests per ${context.after}`,
    },
  }),
});

registerErrorHandler(fastify);

// ── GET /api/rates (issues #47 & #48) ────────────────────────────────────

fastify.get('/api/rates', async (_request, _reply) => {
  return {
    rates:     cache.rates,
    cachedAt:  new Date(cache.cachedAt).toISOString(),
    ttlMs:     env.RATES_CACHE_TTL_MS,
    updatedAt: new Date(cache.cachedAt).toISOString(),
  };
});

// ── GET /api/currencies (issue #49) ───────────────────────────────────────

fastify.get('/api/currencies', async (_request, _reply) => {
  const currencies = SUPPORTED_CURRENCIES.map(code => ({
    code,
    displayName: CURRENCY_DISPLAY_NAMES[code] ?? code,
  }));
  return { currencies };
});

// ── GET /api/quote (issues #48 & #49) ────────────────────────────────────

const QuoteQuerySchema = z.object({
  from:   z.string().default('USDC'),
  to:     z.string().default('NGN'),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a numeric string').default('1'),
});

fastify.get(
  '/api/quote',
  {
    config: {
      rateLimit: {
        max:        100,
        timeWindow: 60 * 1000,
      },
    },
  },
  async (request, reply) => {
    const query  = QuoteQuerySchema.parse(request.query);
    const from   = query.from.toUpperCase();
    const to     = query.to.toUpperCase();
    const amount = parseFloat(query.amount);

    // Validate that both currencies are supported (issue #49)
    const unsupported: string[] = [];
    if (!SUPPORTED_CURRENCIES.includes(from)) unsupported.push(from);
    if (!SUPPORTED_CURRENCIES.includes(to))   unsupported.push(to);

    if (unsupported.length > 0) {
      return reply.code(400).send({
        error:               'Unsupported currency',
        unsupportedCurrencies: unsupported,
        supportedCurrencies: SUPPORTED_CURRENCIES,
      });
    }

    if (from === to) {
      return reply.code(400).send(
        createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'from and to must be different currencies'),
      );
    }

    const rates = cache.rates;
    const amountInNgn  = amount * rates[from];
    const targetAmount = amountInNgn / rates[to];
    const exchangeRate = rates[from] / rates[to];

    return {
      from,
      to,
      amount:       amount.toString(),
      result:       targetAmount.toFixed(4),
      rate:         exchangeRate.toFixed(4),
      slippageLimit: '0.005',
      cachedAt:     new Date(cache.cachedAt).toISOString(),
      expiresAt:    new Date(Date.now() + 60_000).toISOString(),
    };
  },
);

// ── Start ──────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
