# Feature Updates - Zapiet Pickup & Delivery Widget

## 🆕 New Features (Feb 2026)

---

### 1. ⏰ Per-Day Time Slots

**What**: Set different pickup/delivery time slots for each day of the week.

**Why**: Businesses often have different operating hours or capacity on different days.

**Where**: Locations page → Edit location → Pickup/Delivery Availability

**UI**: Tab layout with 7 tabs (Mon-Sun), each with its own time slots field.

**Example Use Case**:
```
Monday:    9:00 AM - 12:00 PM, 1:00 PM - 5:00 PM
Tuesday:   10:00 AM - 2:00 PM
Wednesday: 9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM
Thursday:  10:00 AM - 4:00 PM
Friday:    9:00 AM - 3:00 PM
Saturday:  10:00 AM - 2:00 PM
Sunday:    Closed (no slots)
```

**Widget Behavior**:
- Customer selects a date → Widget shows only time slots for that day
- If no per-day slots configured → Falls back to regular time slots
- Updates automatically when date changes

**Database Fields**:
- `pickupTimeSlotsPerDay` (JSON object)
- `deliveryTimeSlotsPerDay` (JSON object)

---

### 2. 📅 Delivery Next Week Only

**What**: Force deliveries to be scheduled 7+ days in advance, with per-day exceptions.

**Why**: Some businesses need preparation time and can only fulfill next-week orders.

**Where**: 
- **Global**: Settings page → Delivery Next Week Only
- **Per-Location**: Locations page → Edit location → Delivery Availability

**Configuration**:
1. Enable checkbox: "Enable Delivery Next Week Only"
2. Select "same-week days" (exceptions that allow same-week delivery)

**Example Scenario**:
```
Setting: Delivery Next Week Only = ON
Same-week days: Saturday, Sunday

Result:
- Order on Monday → Can deliver from next Monday (7+ days)
- Order on Tuesday → Can deliver from next Tuesday (7+ days)
- Order on Friday → Can deliver from next Friday (7+ days)
- Order on Saturday → Can deliver from Sunday (tomorrow - same week OK)
- Order on Sunday → Can deliver from Monday (tomorrow - same week OK)
```

**Priority**: Location setting overrides global setting

**Warning Banner**: Shows when enabled to inform admin about override behavior.

**Database Fields**:
- Global: `enableDeliveryNextWeekOnly`, `deliveryNextWeekSameWeekDays`
- Location: `deliveryNextWeekOnly`, `deliveryNextWeekSameWeekDays`

---

## 🔧 Technical Details

### Per-Day Time Slots Implementation

**Data Structure**:
```json
{
  "monday": ["9:00 AM - 12:00 PM", "1:00 PM - 5:00 PM"],
  "tuesday": ["10:00 AM - 2:00 PM"],
  "wednesday": ["9:00 AM - 6:00 PM"],
  "thursday": [],
  "friday": ["9:00 AM - 12:00 PM"],
  "saturday": ["11:00 AM - 3:00 PM"],
  "sunday": []
}
```

**Widget Logic Flow**:
1. Customer selects pickup/delivery date
2. Widget extracts day of week (e.g., "monday")
3. Widget checks location's per-day time slots
4. If found → Use those slots
5. If not found → Fall back to regular time slots
6. Populate dropdown with appropriate slots

**Code Location**:
- UI: `app/routes/app.locations.tsx` (lines 950-995, 1070-1115)
- Widget: `widget-src/widget.ts` (`getTimeSlotsForDay()` method)

---

### Delivery Next Week Implementation

**Date Calculation Logic**:
```typescript
function getDeliveryMinDate() {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday, 6 = Saturday
  const dayNames = ['sunday', 'monday', ..., 'saturday'];
  const currentDayName = dayNames[currentDay];
  
  // Check if feature enabled (global or per-location)
  if (enableDeliveryNextWeekOnly) {
    // Parse same-week exception days
    const sameWeekDays = JSON.parse(deliveryNextWeekSameWeekDays);
    
    // If current day is NOT in exceptions
    if (!sameWeekDays.includes(currentDayName)) {
      // Force next week (7 days)
      return addDays(today, 7);
    }
  }
  
  // Default: tomorrow
  return addDays(today, 1);
}
```

**Widget Updates**:
- Recalculates on mode switch (pickup ↔ delivery)
- Recalculates when postal code checked
- Updates `<input type="date">` min attribute

**Code Location**:
- Settings UI: `app/routes/app.settings.tsx` (lines 282-341)
- Locations UI: `app/routes/app.locations.tsx` (lines 1164-1210)
- Widget: `widget-src/widget.ts` (`getDeliveryMinDate()`, `updateDeliveryDateMinimum()`)

---

## 📊 Database Schema Changes

### Location Model
```prisma
model Location {
  // ... existing fields ...
  
  // New fields
  pickupTimeSlotsPerDay        String?  @default("{}")
  deliveryTimeSlotsPerDay      String?  @default("{}")
  deliveryNextWeekOnly         Boolean  @default(false)
  deliveryNextWeekSameWeekDays String   @default("[]")
}
```

### Settings Model
```prisma
model Settings {
  // ... existing fields ...
  
  // New fields
  enableDeliveryNextWeekOnly   Boolean @default(false)
  deliveryNextWeekSameWeekDays String  @default("[]")
}
```

### Migrations Applied
1. `20260205202000_add_location_delivery_next_week`
2. `20260205213000_add_settings_delivery_next_week`
3. Manual: `ALTER TABLE Location ADD COLUMN pickupTimeSlotsPerDay/deliveryTimeSlotsPerDay`

---

## 🎨 UI Components

### Tab Layout (Per-Day Time Slots)
- **Component**: Shopify Polaris `<Tabs>`
- **Tabs**: 7 tabs (Mon-Sun)
- **Content**: TextField (multiline) for each day
- **State**: `useState` for selected tab index
- **Data**: `Record<string, string[]>` for slots per day

### Warning Banner (Delivery Next Week)
- **Component**: Shopify Polaris `<Banner tone="warning">`
- **Visibility**: Only shows when feature enabled
- **Message**: Explains override behavior

### Day Selector (Delivery Next Week)
- **Component**: Multiple `<Checkbox>` components
- **Data**: JSON string array `["saturday", "sunday"]`
- **State**: Parse/stringify on change

---

## 🧪 Testing Guide

### Test Per-Day Time Slots

1. **Setup**:
   - Go to Locations → Edit `[TEST] Normal Store`
   - Click "Or set different time slots for each day"
   - Set different slots for Monday vs Tuesday

2. **Test**:
   - Add items to cart
   - Open cart drawer
   - Select location
   - Choose Monday as date → Verify Monday's slots appear
   - Change to Tuesday → Verify Tuesday's slots appear

3. **Expected**: Time dropdown updates when date changes

### Test Delivery Next Week

1. **Setup**:
   - Go to Settings
   - Enable "Delivery Next Week Only"
   - Select only Saturday and Sunday
   - Save

2. **Test on Friday**:
   - Open cart drawer
   - Select delivery location
   - Check delivery date picker
   - Expected: Minimum date is next Friday (7 days out)

3. **Test on Saturday**:
   - Expected: Minimum date is tomorrow (same week allowed)

### Test Location Override

1. **Setup**:
   - Global setting: OFF
   - Location `[TEST] Next Week Store`: ON (Sat/Sun exceptions)

2. **Test**:
   - Select this location
   - Expected: Delivery next week enforced despite global OFF

---

## 📝 API Changes

### Widget Data Endpoint (`/apps/zapiet`)

**New Fields in Response**:
```json
{
  "settings": {
    "enableDeliveryNextWeekOnly": true,
    "deliveryNextWeekSameWeekDays": "[\"saturday\",\"sunday\"]"
  },
  "locations": [
    {
      "id": "loc-1",
      "pickupTimeSlotsPerDay": "{\"monday\":[...]}",
      "deliveryTimeSlotsPerDay": "{\"monday\":[...]}",
      "deliveryNextWeekOnly": false,
      "deliveryNextWeekSameWeekDays": "[]"
    }
  ]
}
```

**No Breaking Changes**: All new fields are optional with defaults.

---

## 🔄 Backward Compatibility

### Per-Day Time Slots
- ✅ Old locations without per-day slots: Use regular slots
- ✅ Widget falls back gracefully
- ✅ No data migration needed

### Delivery Next Week
- ✅ Disabled by default
- ✅ No behavior change unless explicitly enabled
- ✅ Existing date logic preserved

---

## 🚀 Deployment Checklist

- [x] Database schema updated
- [x] Prisma client regenerated
- [x] Widget rebuilt
- [x] UI tested in admin
- [x] Widget tested in storefront
- [x] Test data added
- [x] Documentation written
- [x] Git commits ready

---

## 📦 Files Modified

**Admin UI**:
- `app/routes/app.settings.tsx` (+69 lines)
- `app/routes/app.locations.tsx` (+177 lines)

**Database**:
- `prisma/schema.prisma` (+4 fields)
- `prisma/migrations/` (+2 migrations)

**Widget**:
- `widget-src/widget.ts` (+139 lines)
- `extensions/zapiet-widget/assets/widget.js` (compiled)

**API**:
- `app/routes/api.widget-data.tsx` (+2 lines)

---

*Version: 2.0.0*  
*Released: February 6, 2026*  
*All requirements complete (5/5)*
