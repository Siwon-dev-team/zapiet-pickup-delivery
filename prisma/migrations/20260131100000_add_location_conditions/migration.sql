-- Add per-location activation conditions
ALTER TABLE "Location" ADD COLUMN "pickupActivationConditions" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Location" ADD COLUMN "deliveryActivationConditions" TEXT NOT NULL DEFAULT '{}';
