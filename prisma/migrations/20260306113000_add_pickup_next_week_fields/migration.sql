ALTER TABLE "Settings" ADD COLUMN "enablePickupNextWeekOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "pickupNextWeekSameWeekDays" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "Location" ADD COLUMN "pickupNextWeekOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Location" ADD COLUMN "pickupNextWeekSameWeekDays" TEXT NOT NULL DEFAULT '[]';
