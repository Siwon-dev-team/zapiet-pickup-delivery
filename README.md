# Zapiet Pickup & Delivery

A Shopify app that enables merchants to offer store pickup and local delivery options to customers during checkout.

## Features

- **Store Pickup**: Allow customers to select pickup locations with scheduled date/time
- **Local Delivery**: Offer local delivery with postal code validation
- **Custom Rates**: Configure price-based and weight-based shipping rates per location
- **Order Management**: View and manage pickup/delivery orders with custom attributes
- **Auto-Tagging**: Automatically tag orders for workflow automation
- **Security Codes**: Generate unique codes for pickup order verification
- **Flexible Settings**: Customise activation conditions, validation rules, and appearance

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
npm run dev          # Start Shopify app dev server
npm run build        # Build for production
npm run deploy       # Deploy to Shopify
```

## Project Structure

```
app/
├── routes/          # Remix routes (pages & API endpoints)
├── db.server.ts     # Database client
└── shopify.server.ts # Shopify app configuration

extensions/
└── zapiet-widget/   # Theme app extension (storefront widget)

prisma/
├── schema.prisma    # Database schema
└── migrations/      # Database migrations
```