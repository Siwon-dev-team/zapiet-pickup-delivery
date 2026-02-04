-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "isPickup" BOOLEAN NOT NULL DEFAULT false,
    "isDelivery" BOOLEAN NOT NULL DEFAULT false,
    "businessHours" TEXT NOT NULL DEFAULT '{}',
    "pickupActivationConditions" TEXT NOT NULL DEFAULT '{}',
    "deliveryActivationConditions" TEXT NOT NULL DEFAULT '{}',
    "pickupDays" TEXT NOT NULL DEFAULT '[]',
    "deliveryDays" TEXT NOT NULL DEFAULT '[]',
    "pickupTimeSlots" TEXT NOT NULL DEFAULT '[]',
    "deliveryTimeSlots" TEXT NOT NULL DEFAULT '[]',
    "pickupPreparationDays" INTEGER NOT NULL DEFAULT 0,
    "deliveryPreparationDays" INTEGER NOT NULL DEFAULT 0,
    "pickupOrderLimitPerDay" INTEGER,
    "deliveryOrderLimitPerDay" INTEGER,
    "pickupOrderLimitPerSlot" INTEGER,
    "deliveryOrderLimitPerSlot" INTEGER,
    "pickupMaxDaysInAdvance" INTEGER NOT NULL DEFAULT 30,
    "deliveryMaxDaysInAdvance" INTEGER NOT NULL DEFAULT 30,
    "pickupBlackoutDates" TEXT NOT NULL DEFAULT '[]',
    "deliveryBlackoutDates" TEXT NOT NULL DEFAULT '[]',
    "pickupTags" TEXT NOT NULL DEFAULT '',
    "deliveryTags" TEXT NOT NULL DEFAULT '',
    "notificationEmails" TEXT NOT NULL DEFAULT '',
    "notificationPhones" TEXT NOT NULL DEFAULT '',
    "allowedProducts" TEXT NOT NULL DEFAULT 'all',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Location" ("address", "businessHours", "city", "country", "createdAt", "deliveryActivationConditions", "id", "isDelivery", "isPickup", "name", "pickupActivationConditions", "shop", "updatedAt", "zip") SELECT "address", "businessHours", "city", "country", "createdAt", "deliveryActivationConditions", "id", "isDelivery", "isPickup", "name", "pickupActivationConditions", "shop", "updatedAt", "zip" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
