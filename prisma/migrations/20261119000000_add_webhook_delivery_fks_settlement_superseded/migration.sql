-- #1097: sync SettlementStatus with retry semantics and enforce referential
-- integrity on IndexedEventWebhookDelivery.

-- AlterEnum
ALTER TYPE "SettlementStatus" ADD VALUE IF NOT EXISTS 'superseded';

-- AddForeignKey
-- NOT VALID enforces the constraint for every new/updated row without
-- scanning (and failing on) historical orphaned deliveries, which are out of
-- scope here. Once those are purged, run
--   ALTER TABLE "IndexedEventWebhookDelivery" VALIDATE CONSTRAINT "<name>";
-- in a follow-up migration.
ALTER TABLE "IndexedEventWebhookDelivery" ADD CONSTRAINT "IndexedEventWebhookDelivery_indexedEventId_fkey" FOREIGN KEY ("indexedEventId") REFERENCES "IndexedEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "IndexedEventWebhookDelivery" ADD CONSTRAINT "IndexedEventWebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
