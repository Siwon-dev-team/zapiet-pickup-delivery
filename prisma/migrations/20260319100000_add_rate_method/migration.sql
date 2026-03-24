-- Add delivery/pickup targeting for rates
ALTER TABLE "Rate" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'BOTH';

