-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "enableDeliveryNextWeekOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "deliveryNextWeekSameWeekDays" TEXT NOT NULL DEFAULT '[]';
