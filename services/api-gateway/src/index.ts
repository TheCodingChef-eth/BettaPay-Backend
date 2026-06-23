/**
 * API Gateway — BettaPay Backend
 *
 * Unified REST entry point for the BettaPay platform.
 * Handles merchant registration, payment sessions, and settlement requests.
 *
 * Endpoints:
 *   GET    /api/health               — liveness probe
 *   POST   /api/auth/token           — login / get JWT
 *   POST   /api/merchants            — register merchant (protected)
 *   GET    /api/merchants/:id        — fetch merchant
 *   DELETE /api/merchants/:id        — soft-delete merchant (protected)
 *   POST   /api/merchants/:id/restore — restore soft-deleted merchant (protected)
 *   POST   /api/payments             — initiate payment session (protected)
 *   GET    /api/payments/:id         — fetch payment session
 *   POST   /api/settlements          — trigger settlement (protected)
 *   GET    /api/deployments          — Soroban contract addresses (testnet)
 */

import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import crypto from 'crypto';
import { validateEnv } from '@bettapay/validation';
import {
  CreateMerchantBody,
  CreatePaymentBody,
  CreateSettlementBody,
  AuthTokenBody
} from '@bettapay/validation';
import { PrismaClient } from '@prisma/client';
import rateLimit from '@fastify/rate-limit';

declare module 'fastify' {
  export interface FastifyInstance {
    authenticate: any;
  }
}

const SENSITIVE_FIELDS = ['secret', 'password', 'token', 'privateKey', 'secretKey'];
const isProduction = process.env.NODE_ENV === 'production';

const env = validateEnv(process.env);
const PORT = Number(process.env.PORT ?? '3000');

const fastify = Fastify({
  logger: true,
  genReqId: function (req) {
    return (req.headers['x-request-id'] as string) || crypto.randomUUID();
  }
});
const prisma = new PrismaClient();

// Setup plugins
fastify.register(cors, {
  origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
});

fastify.register(fastifyJwt, {
  secret: env.JWT_SECRET,
  sign: {
    expiresIn: env.JWT_EXPIRES_IN
  }
});

// Rate limiting: global default and route overrides
fastify.register(rateLimit, {
  max: 1000,
  timeWindow: '1 minute',
  addHeaders: true
});

fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Request body logging for mutation endpoints
async function logRequestBody(request: FastifyRequest, reply: FastifyReply) {
  if (request.body && typeof request.body === 'object') {
    const cloned = JSON.parse(JSON.stringify(request.body));
    for (const key of SENSITIVE_FIELDS) {
      if (key in cloned) {
        cloned[key] = '[REDACTED]';
      }
    }
    const logLevel = isProduction ? 'debug' : 'info';
    request.log[logLevel]({ requestId: request.id, body: cloned }, 'incoming request body');
  }
}

// Authentication hook
fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    request.log.error(err);
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// Routes
fastify.get('/api/health', async (request, reply) => {
  return { status: 'healthy', env: env.NODE_ENV };
});

fastify.post('/api/auth/token', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
  try {
    const d = AuthTokenBody.parse(request.body);
    const merchant = await prisma.merchant.findFirst({ where: { id: d.merchantId, deletedAt: null } });
    if (!merchant) return reply.code(404).send({ error: 'Merchant not found' });

    // In a real system, you would verify the secret/password here.
    // For this example, we'll just issue a token if the merchant exists.
    const token = fastify.jwt.sign({ merchantId: merchant.id, ownerId: merchant.ownerId });
    return reply.send({ token });
  } catch (error) {
    return reply.code(400).send({ error: 'Invalid request payload' });
  }
});

// Merchants
fastify.post('/api/merchants', {
  preValidation: [fastify.authenticate, logRequestBody],
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
}, async (request, reply) => {
  try {
    const d = CreateMerchantBody.parse(request.body);
    const merchant = await prisma.merchant.create({
      data: {
        id: d.id,
        name: d.name,
        ownerId: d.ownerId || 'unknown',
        settings: d.settings ? JSON.parse(JSON.stringify(d.settings)) : {},
      }
    });
    return reply.code(201).send({ success: true, merchant });
  } catch (error) {
    return reply.code(400).send({ error: 'Invalid request payload' });
  }
});

fastify.get('/api/merchants/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const merchant = await prisma.merchant.findFirst({
    where: { id, deletedAt: null },
  });
  if (!merchant) return reply.code(404).send({ error: 'Merchant not found' });
  return merchant;
});

fastify.delete('/api/merchants/:id', {
  preValidation: [fastify.authenticate],
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const merchant = await prisma.merchant.findFirst({
    where: { id, deletedAt: null },
  });
  if (!merchant) return reply.code(404).send({ error: 'Merchant not found' });

  await prisma.merchant.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return reply.code(200).send({ success: true });
});

fastify.post('/api/merchants/:id/restore', {
  preValidation: [fastify.authenticate],
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const merchant = await prisma.merchant.findUnique({ where: { id } });
  if (!merchant) return reply.code(404).send({ error: 'Merchant not found' });
  if (!merchant.deletedAt) {
    return reply.code(400).send({ error: 'Merchant is not soft-deleted' });
  }

  const restored = await prisma.merchant.update({
    where: { id },
    data: { deletedAt: null },
  });

  return reply.code(200).send({ success: true, merchant: restored });
});

// Payments
fastify.post('/api/payments', {
  preValidation: [fastify.authenticate, logRequestBody],
  config: { rateLimit: { max: 300, timeWindow: '1 minute' } }
}, async (request, reply) => {
  try {
    const d = CreatePaymentBody.parse(request.body);
    const payment = await prisma.payment.create({
      data: {
        id: 'pay_' + crypto.randomUUID().replace(/-/g, ''),
        merchantId: d.merchantId,
        payerId: d.payerId,
        amount: d.amount,
        asset: d.asset,
        reference: d.reference,
        status: 'initiated',
      }
    });
    return reply.code(201).send(payment);
  } catch (error) {
    return reply.code(400).send({ error: 'Invalid request payload' });
  }
});

fastify.get('/api/payments/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) return reply.code(404).send({ error: 'Payment not found' });
  return payment;
});

// Settlements
fastify.post('/api/settlements', {
  preValidation: [fastify.authenticate, logRequestBody],
  config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
}, async (request, reply) => {
  try {
    const d = CreateSettlementBody.parse(request.body);
    const settlement = await prisma.settlement.create({
      data: {
        id: 'set_' + crypto.randomUUID().replace(/-/g, ''),
        merchantId: d.merchantId,
        totalAmount: d.amount,
        asset: d.asset,
        status: 'pending',
      }
    });
    return reply.code(201).send(settlement);
  } catch (error) {
    return reply.code(400).send({ error: 'Invalid request payload' });
  }
});

fastify.get('/api/deployments', async (request, reply) => {
  return {
    network: env.STELLAR_NETWORK_PASSPHRASE,
    adminAddress: env.ADMIN_ADDRESS,
    contracts: [
      {
        name: 'Settlement contract',
        contractId: env.SETTLEMENT_CONTRACT_ID,
        explorerUrl: `https://lab.stellar.org/r/testnet/contract/${env.SETTLEMENT_CONTRACT_ID}`,
      },
      {
        name: 'Governance contract',
        contractId: env.GOVERNANCE_CONTRACT_ID,
        explorerUrl: `https://lab.stellar.org/r/testnet/contract/${env.GOVERNANCE_CONTRACT_ID}`,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
});

// Graceful shutdown
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  fastify.log.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const start = async () => {
  try {
    // Seed admin merchant
    await prisma.merchant.upsert({
      where: { id: env.ADMIN_ADDRESS },
      update: {},
      create: {
        id: env.ADMIN_ADDRESS,
        name: 'BettaPay Merchant LLC',
        ownerId: 'admin-user-001',
        settings: { preferredAsset: 'USDC', autoSettle: true },
      }
    });

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
