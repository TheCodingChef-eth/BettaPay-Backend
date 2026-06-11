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
import { validateEnv } from '@bettapay/validation';

const env = validateEnv(process.env);
const PORT = Number(process.env.PORT ?? '3002');

const fastify = Fastify({ logger: true });
fastify.register(cors, { origin: '*' });

const rates: Record<string, number> = {
  USDC: 1545.50,
  EURT: 1680.20,
  NGN: 1.0,
};

fastify.get('/api/rates', async (request, reply) => {
  return { rates, updatedAt: new Date().toISOString() };
});

fastify.get('/api/quote', async (request, reply) => {
  const query = request.query as any;
  const from   = query.from ?? 'USDC';
  const to     = query.to ?? 'NGN';
  const amount = parseFloat(query.amount ?? '1');

  if (!rates[from] || !rates[to]) {
    return reply.code(400).send({ error: 'Unsupported currency pair' });
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
