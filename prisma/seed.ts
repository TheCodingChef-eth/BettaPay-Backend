import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { hashSecret, verifySecret } from "../shared/validation/secret-hash.js";
import { decryptField, encryptField, isEncrypted } from "../shared/validation/encryption.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Encrypts a sensitive value at rest the same way the services do (#1098).
 * Seeding must still work in environments without FIELD_ENCRYPTION_KEY
 * (e.g. a bare local DB), so the value is left as-is when no key is set.
 */
function protectAtRest(value: string): string {
  return process.env.FIELD_ENCRYPTION_KEY ? encryptField(value) : value;
}

/**
 * True when `stored` already holds a salted hash of `secret` in the form this
 * script would write.  Re-seeding then keeps the existing row untouched
 * instead of re-salting on every run; legacy unsalted SHA-256 rows and rows
 * not yet encrypted are upgraded.
 */
function isCurrentSecretHash(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (process.env.FIELD_ENCRYPTION_KEY && !isEncrypted(stored)) return false;
  try {
    const hash = isEncrypted(stored) ? decryptField(stored) : stored;
    return hash.startsWith("scrypt$") && verifySecret(secret, stored);
  } catch {
    return false;
  }
}

async function main() {
  const adminAddress = process.env.ADMIN_ADDRESS;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminAddress || !adminSecret) {
    console.error("ADMIN_ADDRESS and ADMIN_SECRET must be set");
    process.exit(1);
  }

  const existing = await prisma.merchant.findUnique({
    where: { id: adminAddress },
    select: { secretHash: true },
  });
  const adminSecretHash = isCurrentSecretHash(adminSecret, existing?.secretHash)
    ? existing!.secretHash!
    : protectAtRest(hashSecret(adminSecret));

  await prisma.merchant.upsert({
    where: { id: adminAddress },
    update: { secretHash: adminSecretHash },
    create: {
      id: adminAddress,
      name: "BettaPay Merchant LLC",
      ownerId: "admin-user-001",
      settings: { preferredAsset: "USDC", autoSettle: true },
      secretHash: adminSecretHash,
    },
  });

  console.log("Admin merchant seeded successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
