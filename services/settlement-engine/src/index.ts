/**
 * Settlement Engine — BettaPay Backend
 *
 * Handles settlement processing with fee deduction and audit trail.
 *
 * Endpoints:
 *   GET  /api/settlements         — list all settlements
 *   POST /api/settlements         — create and process a settlement
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { validateEnv } from '@bettapay/validation';
import { Queue, Worker } from 'bullmq';

const env = validateEnv(process.env);
const PORT = Number(process.env.PORT ?? '3001');

const fastify = Fastify({ logger: true });
fastify.register(cors, { origin: '*' });

const redisConnection = { host: 'localhost', port: 6379 };
const settlementQueue = new Queue('settlements', { connection: redisConnection });

const worker = new Worker('settlements', async job => {
  console.log(`[Settlement Worker] Processing job ${job.id}`);
  // In a real app, this interacts with Soroban
}, { connection: redisConnection });

const FEE_BPS = 150; 
const settlements: any[] = [];

fastify.get('/api/settlements', async (request, reply) => {
  return { settlements, total: settlements.length };
});

fastify.post('/api/settlements', async (request, reply) => {
  const d = request.body as any;
  const gross = parseFloat(d.amount ?? '0');
  if (gross <= 0) return reply.code(400).send({ error: 'amount must be > 0' });

  const fee = (gross * FEE_BPS) / 10_000;
  const net = gross - fee;

  const record = {
    id: 'set_' + Math.random().toString(36).slice(2, 15),
    merchantId: d.merchantId ?? 'unknown',
    grossAmount: gross.toFixed(2),
    feeAmount: fee.toFixed(2),
    netAmount: net.toFixed(2),
    feeBps: FEE_BPS,
    asset: d.asset ?? 'USDC',
    status: 'completed',
    contractRef: process.env.SETTLEMENT_CONTRACT_ID ?? null,
    createdAt: new Date().toISOString(),
  };

  settlements.unshift(record);
  await settlementQueue.add('process-settlement', record);

  return reply.code(201).send(record);
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
