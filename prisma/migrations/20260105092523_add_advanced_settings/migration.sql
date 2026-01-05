-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "enablePickup" BOOLEAN NOT NULL DEFAULT true,
    "enableDelivery" BOOLEAN NOT NULL DEFAULT false,
    "pickupTitle" TEXT NOT NULL DEFAULT 'Store Pickup',
    "deliveryTitle" TEXT NOT NULL DEFAULT 'Local Delivery',
    "primaryColor" TEXT NOT NULL DEFAULT '#008060',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "pickupActivationConditions" TEXT NOT NULL DEFAULT '{}',
    "deliveryActivationConditions" TEXT NOT NULL DEFAULT '{}',
    "autoTagPickup" TEXT NOT NULL DEFAULT '',
    "autoTagDelivery" TEXT NOT NULL DEFAULT '',
    "enableSecurityCode" BOOLEAN NOT NULL DEFAULT true,
    "postalCodeValidation" TEXT NOT NULL DEFAULT 'none'
);
INSERT INTO "new_Settings" ("deliveryTitle", "enableDelivery", "enablePickup", "id", "logoUrl", "pickupTitle", "primaryColor", "shop") SELECT "deliveryTitle", "enableDelivery", "enablePickup", "id", coalesce("logoUrl", '') AS "logoUrl", "pickupTitle", coalesce("primaryColor", '#008060') AS "primaryColor", "shop" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_shop_key" ON "Settings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
