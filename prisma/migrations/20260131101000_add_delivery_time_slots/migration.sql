-- Add delivery time slot settings
ALTER TABLE "Settings" ADD COLUMN "deliveryTimeSlots" TEXT NOT NULL DEFAULT '9:00 AM - 12:00 PM,12:00 PM - 3:00 PM,3:00 PM - 6:00 PM,5:00 PM - 11:00 PM';
