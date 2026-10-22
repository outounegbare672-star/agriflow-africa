CREATE TYPE "TraceabilityEventType" AS ENUM (
    'HARVEST_RECORDED',
    'QUALITY_CHECKED',
    'STORED',
    'DISPATCHED',
    'RECEIVED'
);

CREATE TYPE "SmsCategory" AS ENUM ('HARVEST', 'WEATHER', 'PAYMENT', 'MARKET');

CREATE TYPE "SmsStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TYPE "MobileMoneyCheckoutStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'FAILED');

CREATE TABLE "AiRecommendationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRecommendationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRecommendationRequest_userId_createdAt_idx"
ON "AiRecommendationRequest"("userId", "createdAt");

ALTER TABLE "AiRecommendationRequest"
ADD CONSTRAINT "AiRecommendationRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Producer"
ADD COLUMN "smsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smsConsentAt" TIMESTAMP(3);

ALTER TABLE "Farm"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

ALTER TABLE "Harvest"
ADD COLUMN "batchCode" TEXT;

UPDATE "Harvest"
SET "batchCode" = 'AG-' || upper(md5("id"));

ALTER TABLE "Harvest"
ALTER COLUMN "batchCode" SET NOT NULL;

CREATE UNIQUE INDEX "Harvest_batchCode_key" ON "Harvest"("batchCode");

CREATE TABLE "TraceabilityEvent" (
    "id" TEXT NOT NULL,
    "type" "TraceabilityEventType" NOT NULL,
    "note" TEXT NOT NULL,
    "location" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "harvestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceabilityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsNotification" (
    "id" TEXT NOT NULL,
    "category" "SmsCategory" NOT NULL,
    "toPhone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT,
    "providerReference" TEXT,
    "error" TEXT,
    "cooperativeId" TEXT NOT NULL,
    "producerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "SmsNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MobileMoneyCheckout" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentUrl" TEXT,
    "providerReference" TEXT,
    "status" "MobileMoneyCheckoutStatus" NOT NULL DEFAULT 'CREATED',
    "buyerId" TEXT NOT NULL,
    "cooperativeId" TEXT NOT NULL,
    "marketListingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MobileMoneyCheckout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TraceabilityEvent_harvestId_eventDate_idx" ON "TraceabilityEvent"("harvestId", "eventDate");

CREATE INDEX "SmsNotification_cooperativeId_createdAt_idx" ON "SmsNotification"("cooperativeId", "createdAt");

CREATE INDEX "SmsNotification_status_createdAt_idx" ON "SmsNotification"("status", "createdAt");

CREATE UNIQUE INDEX "SmsNotification_dedupeKey_key" ON "SmsNotification"("dedupeKey");

CREATE UNIQUE INDEX "MobileMoneyCheckout_transactionId_key" ON "MobileMoneyCheckout"("transactionId");

CREATE INDEX "MobileMoneyCheckout_buyerId_createdAt_idx" ON "MobileMoneyCheckout"("buyerId", "createdAt");

CREATE INDEX "MobileMoneyCheckout_cooperativeId_createdAt_idx" ON "MobileMoneyCheckout"("cooperativeId", "createdAt");

CREATE INDEX "MobileMoneyCheckout_marketListingId_status_idx" ON "MobileMoneyCheckout"("marketListingId", "status");

ALTER TABLE "TraceabilityEvent"
ADD CONSTRAINT "TraceabilityEvent_harvestId_fkey"
FOREIGN KEY ("harvestId") REFERENCES "Harvest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TraceabilityEvent" ("id", "type", "note", "eventDate", "harvestId")
SELECT
    'trace-' || md5("id"),
    'HARVEST_RECORDED'::"TraceabilityEventType",
    'Récolte déjà enregistrée avant l’activation du suivi détaillé.',
    "date",
    "id"
FROM "Harvest";

ALTER TABLE "SmsNotification"
ADD CONSTRAINT "SmsNotification_cooperativeId_fkey"
FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SmsNotification"
ADD CONSTRAINT "SmsNotification_producerId_fkey"
FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MobileMoneyCheckout"
ADD CONSTRAINT "MobileMoneyCheckout_buyerId_fkey"
FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobileMoneyCheckout"
ADD CONSTRAINT "MobileMoneyCheckout_cooperativeId_fkey"
FOREIGN KEY ("cooperativeId") REFERENCES "Cooperative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MobileMoneyCheckout"
ADD CONSTRAINT "MobileMoneyCheckout_marketListingId_fkey"
FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
