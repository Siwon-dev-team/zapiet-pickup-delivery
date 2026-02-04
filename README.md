# Zapiet Pickup & Delivery

A Shopify app that enables merchants to offer store pickup and local delivery options to customers during checkout.

## Features

### Core Functionality
- **Store Pickup**: Customers select pickup locations with scheduled date/time slots
- **Local Delivery**: Postal code validation with progressive field display (postal code → date → time)
- **Order Notes**: Customers can add general order notes and method-specific notes
- **Custom Rates**: Price-based and weight-based shipping rates per location

### Advanced Features
- **Location Activation Conditions**: Per-location rules based on cart value, weight, and delivery zones
- **Delivery Time Slots**: Configurable time windows for delivery scheduling
- **Postal Code Validation**: Support for none/partial/full validation modes
- **Auto-Tagging**: Automatically tag orders for workflow automation
- **Business Hours Display**: Show location-specific opening hours
- **Fallback Rates**: Default shipping costs when no rules match

### Admin Interface
- **Location Management**: Add, edit, and configure pickup/delivery locations
- **Rate Configuration**: Flexible rate rules with min/max conditions
- **Settings Panel**: Customise colors, titles, notes, and validation rules
- **Order Management**: View orders filtered by pickup/delivery method

## Tech Stack

- **Framework**: Remix (React Router)
- **Language**: TypeScript
- **Database**: Prisma ORM with SQLite (dev) / PostgreSQL (production)
- **UI**: Shopify Polaris
- **Integration**: Shopify Admin API, App Bridge, Theme App Extensions

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables (see `.env.example`)
4. Run database migrations:
   ```bash
   npm run prisma migrate dev
   ```
5. Start the development server:
   ```bash
   npm run dev
   ```

## Development

```bash
npm run dev              # Start Shopify app dev server
npm run widget:build     # Build storefront widget
npm run build            # Build for production
npm run deploy           # Deploy to Shopify
npx prisma generate      # Regenerate Prisma client
npx prisma db push       # Sync database schema
```

## Storefront Widget Notes

- The widget is injected by the app embed in `extensions/zapiet-widget/blocks/app-embed.liquid`.
- UI behavior and event handling live in `widget-src/widget.ts` and compile to `extensions/zapiet-widget/assets/widget.js`.
- Rebuild the widget after any `widget-src/` changes:
  ```bash
  npm run widget:build
  ```

## Project Structure

```
app/
├── routes/
│   ├── app.*.tsx              # Admin dashboard pages
│   ├── api.widget-data.tsx    # Widget API endpoint
│   └── webhooks.*.tsx         # Shopify webhooks
├── db.server.ts               # Prisma database client
└── shopify.server.ts          # Shopify app configuration

extensions/zapiet-widget/
├── blocks/
│   ├── app-embed.liquid       # Widget container & injection logic
│   └── pickup-delivery.liquid # Product page block
├── assets/
│   ├── widget.js              # Compiled widget bundle
│   └── widget.css             # Widget styles
└── shopify.extension.toml     # Extension configuration

widget-src/
├── widget.ts                  # Widget TypeScript source
└── build.ts                   # ESBuild compilation script

prisma/
├── schema.prisma              # Database models (Location, Rate, Settings)
└── migrations/                # Migration history
```

## Database Schema

- **Location**: Pickup/delivery locations with activation conditions
- **Rate**: Shipping rates (price/weight-based) per location
- **Settings**: Global app configuration and preferences
- **Session**: Shopify app session management