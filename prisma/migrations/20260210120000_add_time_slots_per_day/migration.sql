-- AlterTable
ALTER TABLE "Location" ADD COLUMN "deliveryTimeSlotsPerDay" TEXT DEFAULT '{}';
ALTER TABLE "Location" ADD COLUMN "pickupTimeSlotsPerDay" TEXT DEFAULT '{}';
