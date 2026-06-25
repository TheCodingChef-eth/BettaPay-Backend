/**
 * FX Engine — BettaPay Backend
 *
 * Provides exchange rate quotes for currency pairs.
 * Supports USDC, EURT, and NGN with mock rates.
 *
 * Endpoints:
 *   GET /api/rates               — all live rates
 *   GET /api/quote?from=&to=&amount= — FX quote
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { validateEnv, createErrorResponse, ErrorCodes } from '@bettapay/validation';
const env = validateEnv(process.env);
const PORT = Number(process.env.PORT ?? '3002');

const fastify = Fastify({ logger: true });
fastify.register(cors, { 
  origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
});

const rates: Record<string, number> = {
  USDC: 1545.50,
  EURT: 1680.20,
  NGN: 1.0,
};

fastify.get('/api/rates', async (request, reply) => {
  return { rates, updatedAt: new Date().toISOString() };
});

const QuoteQuerySchema = z.object({
  from: z.string().default('USDC'),
  to: z.string().default('NGN'),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a numeric string').default('1'),
});

fastify.get('/api/quote', async (request, reply) => {
  try {
    const query = QuoteQuerySchema.parse(request.query);
    const from   = query.from;
    const to     = query.to;
    const amount = parseFloat(query.amount);
    if (!rates[from] || !rates[to]) {
      return reply.code(400).send(createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Unsupported currency pair'));
    }

    const amountInNgn  = amount * rates[from];
    const targetAmount = amountInNgn / rates[to];
    const exchangeRate = rates[from] / rates[to];

    return {
      from, to,
      amount: amount.toString(),
      result: targetAmount.toFixed(4),
      rate: exchangeRate.toFixed(4),
      slippageLimit: '0.005',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.code(400).send(createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid query parameters', error.errors));
    }
    return reply.code(400).send(createErrorResponse(ErrorCodes.INVALID_REQUEST, 'Invalid request'));
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
