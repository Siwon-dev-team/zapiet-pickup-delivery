-- AlterTable
ALTER TABLE "Location" ADD COLUMN "deliveryNextWeekOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Location" ADD COLUMN "deliveryNextWeekSameWeekDays" TEXT NOT NULL DEFAULT '[]';
