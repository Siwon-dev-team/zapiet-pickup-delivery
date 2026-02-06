# Zapiet Pickup & Delivery

A Shopify app that enables merchants to offer store pickup and local delivery options to customers during checkout.

## Features

### Core Functionality
- **Store Pickup**: Customers select pickup locations with scheduled date/time slots
- **Local Delivery**: Postal code validation with progressive field display (postal code  date  time)
- **Order Notes**: Customers can add general order notes and method-specific notes
- **Custom Rates**: Price-based and weight-based shipping rates per location

### Advanced Features
- **Location Activation Conditions**: Per-location rules based on cart value, weight, and delivery zones
- **Delivery Time Slots**: Configurable time windows for delivery scheduling
- **Postal Code Validation**: Support for none/partial/full validation modes
- **Auto-Tagging**: Automatically tag orders for workflow automation
- **Business Hours Display**: Show location-specific opening hours
- **Fallback Rates**: Default shipping costs when no rules match

###  New Features (Feb 2026)

####  Per-Day Time Slots
Set different pickup/delivery time slots for each day of the week with an intuitive tab interface.

**Use Case**: A bakery that has different pickup times on weekends vs weekdays.

**Example Configuration**:
```
Monday:    9:00 AM - 12:00 PM, 1:00 PM - 5:00 PM
Tuesday:   10:00 AM - 2:00 PM
Wednesday: 9:00 AM - 12:00 PM, 2:00 PM - 6:00 PM
Thursday:  10:00 AM - 4:00 PM
Friday:    9:00 AM - 3:00 PM
Saturday:  10:00 AM - 2:00 PM
Sunday:    Closed (no time slots)
```

**Widget Behavior**: 
- Dynamically shows only time slots for the selected date
- Falls back to regular time slots if per-day not configured
- Updates automatically when date changes

**Where**: Locations page  Edit location  Pickup/Delivery Availability  Tab layout

---

####  Delivery Next Week Only
Force deliveries to be scheduled 7+ days in advance, with configurable same-week exceptions.

**Use Case**: Businesses that need significant preparation time (custom cakes, flowers, etc.).

**Example Scenario**:
```
Setting: Delivery Next Week Only = ON
Same-week exception days: Saturday, Sunday

Results:
¢ Order on Monday-Friday  Must deliver 7+ days out (next week)
¢ Order on Saturday-Sunday  Can deliver tomorrow (same week allowed)
```

**Features**:
- Global setting (applies to all locations)
- Per-location override (specific locations can have different rules)
- Warning banner when enabled
- Location setting takes precedence over global

**Where**: 
- **Global**: Settings page  Delivery Next Week Only
- **Per-Location**: Locations page  Edit location  Delivery Availability

---

### Admin Interface
- **Location Management**: Add, edit, and configure pickup/delivery locations
- **Rate Configuration**: Flexible rate rules with min/max conditions
- **Settings Panel**: Customise colors, titles, notes, and validation rules
- **Order Management**: View orders filtered by pickup/delivery method

---

## Tech Stack

- **Framework**: Remix (React Router)
- **Language**: TypeScript
- **Database**: Prisma ORM with SQLite (dev) / PostgreSQL (production)
- **UI**: Shopify Polaris
- **Integration**: Shopify Admin API, App Bridge, Theme App Extensions

---

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables (see `.env.example`)
4. Run database migrations:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```

---

## Development

```bash
npm run dev              # Start Shopify app dev server
npm run widget:build     # Build storefront widget
npm run build            # Build for production
npm run deploy           # Deploy to Shopify
npx prisma generate      # Regenerate Prisma client
npx prisma db push       # Sync database schema
```

---

## Storefront Widget Notes

- The widget is injected by the app embed in `extensions/zapiet-widget/blocks/app-embed.liquid`.
- UI behavior and event handling live in `widget-src/widget.ts` and compile to `extensions/zapiet-widget/assets/widget.js`.
- **Important**: Rebuild the widget after any `widget-src/` changes:
  ```bash
  npm run widget:build
  ```

---

## Project Structure

```
app/
 routes/
‚    app.*.tsx              # Admin dashboard pages
‚    api.widget-data.tsx    # Widget API endpoint
‚    webhooks.*.tsx         # Shopify webhooks
 db.server.ts               # Prisma database client
 shopify.server.ts          # Shopify app configuration

extensions/zapiet-widget/
 blocks/
‚    app-embed.liquid       # Widget container & injection logic
‚    pickup-delivery.liquid # Product page block
 assets/
‚    widget.js              # Compiled widget bundle
‚    widget.css             # Widget styles
 shopify.extension.toml     # Extension configuration

widget-src/
 widget.ts                  # Widget TypeScript source
 build.ts                   # ESBuild compilation script

prisma/
 schema.prisma              # Database models
 migrations/                # Migration history
```

---

## Database Schema

### Models

#### Location
Stores pickup/delivery location information with per-location settings:
- Basic info: name, address, city, zip, country
- Availability: pickup/delivery enabled, days, time slots
- **Per-day time slots**: Different time slots for each day of the week
- **Delivery next week**: Per-location override for next-week delivery
- Scheduling: preparation days, max days in advance, blackout dates
- Limits: order limits per day/slot
- Activation conditions: cart value, weight, postal codes
- Notifications: emails, phones
- Tagging: custom tags for orders

#### Rate
Shipping rate rules per location:
- Type: PRICE or WEIGHT based
- Conditions: min/max thresholds
- Price: shipping cost

#### Settings
Global app configuration:
- Pickup/delivery toggles and titles
- Appearance: colors, logo
- Validation: postal code rules
- Auto-tagging for orders
- **Delivery next week**: Global setting with same-week exceptions
- Fallback rates
- Location sort order

#### Session
Shopify app session management

---

## Testing Guide

###  Test Setup

#### Test Locations Provided

Two test locations are included for comprehensive testing:

1. **[TEST] Normal Store - Pickup & Delivery**
   - Address: 123 Main Street, Ottawa K1A 0A1
   - Pickup: Mon-Sat
   - Delivery: Mon-Sun
   - **Per-day time slots configured** to demonstrate feature
   - No delivery restrictions

2. **[TEST] Next Week Store - Sat/Sun Same Week**
   - Address: 456 Oak Avenue, Ottawa K2P 1L4
   - Pickup & Delivery: Mon-Sun
   - **Delivery next week enabled**: Sat/Sun allow same-week, Mon-Fri force next week

#### Create Test Locations

```bash
# View existing test locations
sqlite3 prisma/dev.sqlite "SELECT name, deliveryNextWeekOnly FROM Location WHERE id LIKE 'test-loc-%';"

# Delete test locations when done
sqlite3 prisma/dev.sqlite "DELETE FROM Location WHERE id LIKE 'test-loc-%';"
```

---

###  Core Features Testing

#### 1. Test Cart Page & Cart Drawer
**Critical**: Both must work identically.

1. **Empty Cart Test**:
   - Open cart drawer (empty)  Widget should show
   - Add item  Widget updates with options

2. **Cart Page Test**:
   - Navigate to `/cart`
   - Widget shows pickup/delivery options
   - Can select location, date, time

3. **Cart Drawer Test**:
   - Add items to cart
   - Open cart drawer (theme's cart button)
   - Widget shows pickup/delivery options
   - Can select location, date, time
   - **Must work the same as cart page**

**Expected**: Widget visible and functional in both locations.

---

#### 2. Test Store Pickup

1. Add items to cart
2. Open cart drawer or cart page
3. Select **Pickup** button
4. Choose a location from list
5. Select date (minimum: tomorrow)
6. Select time slot
7. Add pickup note (if enabled)
8. Verify rate displays correctly
9. Proceed to checkout
10. Check cart attributes saved

---

#### 3. Test Local Delivery

1. Add items to cart
2. Open cart drawer or cart page
3. Select **Delivery** button
4. Enter postal code
5. Click "Check Availability"
6. Verify eligible locations shown
7. Select date (minimum: tomorrow)
8. Select time slot
9. Add delivery note (if enabled)
10. Verify rate displays correctly
11. Proceed to checkout
12. Check cart attributes saved

---

###  New Features Testing

#### 4. Test Per-Day Time Slots

**Setup**:
1. Go to **Locations**  Edit **[TEST] Normal Store**
2. Scroll to **"Or set different time slots for each day"**
3. Click **Monday** tab
4. Enter: `9:00 AM - 12:00 PM` (new line) `1:00 PM - 5:00 PM`
5. Click **Tuesday** tab
6. Enter: `10:00 AM - 2:00 PM`
7. Click **Wednesday** tab
8. Enter: `9:00 AM - 6:00 PM`
9. Save location

**Test in Storefront**:
1. Add items to cart
2. Open cart drawer
3. Select **[TEST] Normal Store**
4. Choose **Monday** as pickup date
   - **Expected**: Time dropdown shows only Monday's slots (9-12, 1-5)
5. Change date to **Tuesday**
   - **Expected**: Time dropdown updates to show only Tuesday's slot (10-2)
6. Change date to **Wednesday**
   - **Expected**: Time dropdown shows only Wednesday's slot (9-6)

**Fallback Test**:
1. Edit a location WITHOUT per-day slots
2. Only fill regular "Time Slots" field
3. In storefront, select this location
4. Change dates  Time slots should stay the same (fallback behavior)

---

#### 5. Test Delivery Next Week Only (Global Setting)

**Test on Friday** (Next Week Forced):
1. Go to **Settings**
2. Enable **"Delivery Next Week Only"**
3. Select **Saturday** and **Sunday** as same-week days
4. Save settings
5. Open cart drawer
6. Select **Delivery**
7. Check postal code
8. Select delivery date
   - **Expected**: Minimum date is **next Friday (Feb 13)** - 7 days out
9. Check console logs for `[Zapiet Delivery Next Week]`

**Test on Saturday** (Same Week Allowed):
1. Wait until Saturday OR change system date to Saturday
2. Repeat steps 5-8
   - **Expected**: Minimum date is **tomorrow (Sunday)** - same week allowed

---

#### 6. Test Delivery Next Week (Per-Location Override)

**Setup**:
1. Go to **Settings**
2. **Disable** "Delivery Next Week Only" (turn OFF)
3. Save
4. Go to **Locations**  Edit **[TEST] Next Week Store**
5. Scroll to delivery section
6. Enable **"Delivery Next Week Only (Location Override)"**
7. Select **Saturday** and **Sunday**
8. Save location

**Test**:
1. Open cart drawer
2. Select **Delivery**
3. Enter postal code for this location
4. Select delivery date
   - **Expected on Mon-Fri**: Minimum date is 7 days out
   - **Expected on Sat-Sun**: Minimum date is tomorrow

**Verify Override**:
- Global setting is OFF
- But this location still enforces next week rule
- **Confirms**: Location setting overrides global setting

---

###  Advanced Testing Scenarios

#### Multi-Location Testing
1. Create locations with different per-day time slots
2. Customer checks postal code
3. Multiple locations eligible
4. Select different locations  Verify time slots change

#### Edge Cases
1. **Empty Time Slots**: Leave a day empty  Should show no slots for that day
2. **JSON Fallback**: Delete per-day slots  Should use regular time slots
3. **Invalid JSON**: Manually corrupt JSON in DB  Should fall back gracefully
4. **Date Boundaries**: Test on Sunday evening, verify Monday calculation
5. **Leap Years**: Test Feb 29 on leap years

---

## Debugging

### Common Issues

#### Widget Not Loading
1. Check Theme Editor  App Embeds  "Zapiet App Embed" is **ON**
2. Check browser console for errors
3. Check Network tab for `/apps/zapiet` API call (should return 200)
4. Verify `#zapiet-widget-root` exists in DOM

#### Widget Visible But Empty
1. Check API response has `settings`, `locations`, `rates`
2. Verify `cart.item_count > 0` (or force display)
3. Check console for `[Zapiet Init]` logs
4. Inspect `.zapiet-content` display property

#### Time Slots Not Updating
1. Check browser console for JavaScript errors
2. Verify date input has value
3. Check per-day time slots JSON format
4. Test with regular time slots as fallback

#### Delivery Next Week Not Working
1. Check console logs: `[Zapiet Delivery Next Week]`
2. Verify setting saved in database
3. Check current day calculation
4. Verify same-week days JSON array format

### Debug Console Logs

Filter browser console by:
- `[Zapiet Inject]` - Widget injection process
- `[Zapiet Init]` - Widget initialization
- `[Zapiet Delivery Next Week]` - Next week feature logs

---

## API Endpoints

### Widget Data Endpoint
**Path**: `/apps/zapiet?shop={shop_domain}`  
**Method**: GET  
**Response**:
```json
{
  "settings": {
    "enablePickup": true,
    "enableDelivery": true,
    "primaryColor": "#008060",
    "enableDeliveryNextWeekOnly": false,
    "deliveryNextWeekSameWeekDays": "[]",
    ...
  },
  "locations": [
    {
      "id": "loc-1",
      "name": "Downtown Store",
      "isPickup": true,
      "isDelivery": true,
      "pickupTimeSlots": "[\"9:00 AM\", \"10:00 AM\"]",
      "pickupTimeSlotsPerDay": "{\"monday\":[\"9:00 AM\"], \"tuesday\":[\"10:00 AM\"]}",
      "deliveryNextWeekOnly": false,
      "deliveryNextWeekSameWeekDays": "[]",
      ...
    }
  ],
  "rates": [
    {
      "id": "rate-1",
      "locationId": "loc-1",
      "type": "PRICE",
      "min": 0,
      "max": 50,
      "price": 5.99
    }
  ]
}
```

---

## Admin Pages

### Settings Page (`/app/settings`)
Configure global app behavior:
- Enable/disable pickup and delivery
- Set titles and branding (colors, logo)
- Configure postal code validation
- Set activation conditions
- Enable order notes
- **Delivery next week only** (global setting)
- Auto-tagging rules
- Fallback rates
- Location sort order

### Locations Page (`/app/locations`)
Manage pickup/delivery locations:
- Create/edit/delete locations
- Set address and contact info
- Configure business hours
- Set pickup/delivery availability days
- Configure time slots:
  - Regular time slots (same for all days)
  - **Per-day time slots** (different for each day) - Tab interface
- Set preparation days and max advance booking
- Configure blackout dates
- Set order limits (per day/per slot)
- **Delivery next week only** (per-location override)
- Activation conditions (cart value, weight, zones)
- Notification settings

### Orders Page (`/app/orders`)
View and filter orders by pickup/delivery method.

---

## Database Schema Details

### Location Fields (Updated)

**New Fields**:
- `pickupTimeSlotsPerDay` (String, JSON): Time slots per day `{"monday": ["9am"], ...}`
- `deliveryTimeSlotsPerDay` (String, JSON): Time slots per day
- `deliveryNextWeekOnly` (Boolean): Enable next-week delivery for this location
- `deliveryNextWeekSameWeekDays` (String, JSON): Exception days `["saturday", "sunday"]`

**Core Fields**:
- `id`, `shop`, `name`, `address`, `city`, `zip`, `country`
- `isPickup`, `isDelivery`
- `businessHours` (JSON)
- `pickupDays`, `deliveryDays` (JSON arrays)
- `pickupTimeSlots`, `deliveryTimeSlots` (JSON arrays)
- `pickupPreparationDays`, `deliveryPreparationDays`
- `pickupMaxDaysInAdvance`, `deliveryMaxDaysInAdvance`
- `pickupBlackoutDates`, `deliveryBlackoutDates` (JSON arrays)
- `pickupOrderLimitPerDay`, `deliveryOrderLimitPerDay`
- `pickupOrderLimitPerSlot`, `deliveryOrderLimitPerSlot`
- `pickupActivationConditions`, `deliveryActivationConditions` (JSON)
- `pickupTags`, `deliveryTags`
- `notificationEmails`, `notificationPhones`
- `allowedProducts`

### Settings Fields (Updated)

**New Fields**:
- `enableDeliveryNextWeekOnly` (Boolean): Global next-week delivery
- `deliveryNextWeekSameWeekDays` (String, JSON): Global exception days

**Core Fields**:
- `id`, `shop`
- `enablePickup`, `enableDelivery`
- `pickupTitle`, `deliveryTitle`
- `primaryColor`, `logoUrl`
- `pickupActivationConditions`, `deliveryActivationConditions` (JSON)
- `autoTagPickup`, `autoTagDelivery`
- `enableSecurityCode`
- `postalCodeValidation` (none/partial/full)
- `enablePickupNote`, `enableDeliveryNote`
- `preselectLocation` (first/'')
- `locationSortOrder` (newest/oldest/alphabetical/reverse-alphabetical)
- `fallbackRate`
- `deliveryTimeSlots`

---

## Widget Implementation

### Key Features

#### Dynamic Time Slot Loading
```typescript
// Get time slots based on selected date
getTimeSlotsForDay(location, isPickup, selectedDate)
   Checks per-day time slots first
   Falls back to regular time slots
   Returns array of time strings
```

#### Delivery Date Restriction
```typescript
// Calculate minimum delivery date
getDeliveryMinDate()
   Checks global/location settings
   Calculates based on current day
   Returns ISO date string (YYYY-MM-DD)
```

#### Event Handling
- Event delegation for pickup/delivery mode switching
- Date change listeners to update time slots
- Postal code validation
- Cart attribute updates

---

## How It Works

### Storefront Flow

1. **Widget Injection**:
   - App embed loads on cart page/drawer
   - Fetches settings/locations from `/apps/zapiet`
   - Injects widget HTML into cart
   - Initializes event listeners

2. **Customer Selection**:
   - Customer chooses pickup or delivery
   - For pickup: Selects location  date  time
   - For delivery: Enters postal code  selects date  time
   - Widget validates and shows rates

3. **Date & Time Selection**:
   - Date picker has dynamic minimum (based on delivery next week setting)
   - Time slots update based on selected date (per-day feature)
   - Falls back gracefully if per-day not configured

4. **Cart Attributes**:
   - All selections saved to cart attributes
   - Attributes: `method`, `location`, `date`, `time`, `note`
   - Persisted through checkout

5. **Checkout**:
   - Cart attributes passed to order
   - Order tagged automatically (if configured)
   - Notifications sent (if configured)

---

## Configuration Examples

### Example 1: Bakery with Weekend-Only Pickup

**Settings**:
- Enable Pickup: ON
- Enable Delivery: OFF

**Location**: "Main Bakery"
- Pickup Days: Saturday, Sunday
- Per-day time slots:
  - Saturday: `10:00 AM - 12:00 PM`, `12:00 PM - 2:00 PM`
  - Sunday: `11:00 AM - 1:00 PM`
- Preparation Days: 2
- Order Limit per Day: 20

**Result**: Customers can only pickup on weekends, at least 2 days in advance, max 20 orders per day.

---

### Example 2: Florist with Next-Week Delivery

**Settings**:
- Enable Delivery: ON
- Delivery Next Week Only: ON
- Same-week days: Saturday, Sunday

**Location**: "Flower Shop"
- Delivery Days: Mon-Sun
- Per-day delivery time slots:
  - Mon-Fri: `9:00 AM - 12:00 PM`, `12:00 PM - 3:00 PM`, `3:00 PM - 6:00 PM`
  - Sat-Sun: `11:00 AM - 3:00 PM`
- Delivery Preparation Days: 1

**Result**: 
- Orders Mon-Fri  Deliver 7+ days out (next week)
- Orders Sat-Sun  Deliver from tomorrow
- Different time slots for weekday vs weekend

---

### Example 3: Multi-Location Store Chain

**Global Settings**:
- Enable Pickup: ON
- Enable Delivery: ON
- Preselect Location: first
- Location Sort Order: alphabetical

**Location A**: "Downtown"
- Pickup: Mon-Fri, 9am-5pm
- Delivery: Mon-Sun, zones: K1*, K2*
- No delivery restrictions

**Location B**: "Suburbs"
- Pickup: Mon-Sat, 10am-6pm
- Delivery: Mon-Sun, zones: K7*, K8*
- **Delivery Next Week Only**: ON (Sat/Sun exceptions)
- Per-day time slots for different capacity each day

**Result**: 
- Customers see locations based on postal code
- Location B has stricter delivery scheduling
- Each location has independent time slot configuration

---

## Troubleshooting

### Widget Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Widget not appearing | App embed disabled | Enable in Theme Editor |
| Widget invisible | CSS override | Check `#zapiet-widget-root` styles |
| Options not loading | API error | Check Network tab, verify `/apps/zapiet` returns 200 |
| Duplicate widgets | Multiple injections | Clear cache, check `cleanupDuplicateWidgets()` |
| Stale cart data | Race condition | Verify `async/await` in injection logic |

### Time Slot Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Same slots every day | Per-day not configured | Check location per-day time slots |
| No slots showing | Empty array or invalid JSON | Check database field, verify JSON format |
| Slots not updating on date change | Event listener issue | Check browser console for errors |

### Delivery Next Week Issues

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Always shows tomorrow | Feature disabled | Check settings, verify enabled=true |
| Always shows next week | Same-week days empty | Select exception days (Sat/Sun) |
| Not respecting current day | Day name mismatch | Check lowercase format in JSON |

**Debug SQL**:
```sql
-- Check settings
SELECT enableDeliveryNextWeekOnly, deliveryNextWeekSameWeekDays FROM Settings;

-- Check location
SELECT name, deliveryNextWeekOnly, deliveryNextWeekSameWeekDays FROM Location;
```

---

## Performance

- **Widget Bundle**: ~52KB (gzipped: ~15KB)
- **API Response**: < 100KB typical
- **Load Time**: < 200ms on modern connections
- **Database Queries**: Optimized with Prisma (1 query for locations, 1 for rates)

---

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## Version History

### v2.0.0 (Feb 6, 2026)
- Added per-day time slots with tab interface
- Added delivery next week only feature
- Added per-location delivery next week override
- Fixed cart drawer race conditions
- Fixed widget visibility issues
- Added comprehensive documentation

### v1.0.0 (Jan 2026)
- Initial release
- Store pickup functionality
- Local delivery with postal code validation
- Custom rates (price/weight based)
- Admin UI with Shopify Polaris
