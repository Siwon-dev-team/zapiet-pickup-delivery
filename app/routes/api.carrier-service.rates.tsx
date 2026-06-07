import { json, type ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";

interface ShopifyRateRequest {
  rate: {
    origin: {
      country: string;
      postal_code: string;
      province: string;
      city: string;
      name: string | null;
      address1: string;
      address2: string | null;
      address3: string | null;
      phone: string | null;
      fax: string | null;
      email: string | null;
      address_type: string | null;
      company_name: string | null;
    };
    destination: {
      country: string;
      postal_code: string;
      province: string;
      city: string;
      name: string | null;
      address1: string;
      address2: string | null;
      address3: string | null;
      phone: string | null;
      fax: string | null;
      email: string | null;
      address_type: string | null;
      company_name: string | null;
    };
    items: Array<{
      name: string;
      sku: string;
      quantity: number;
      grams: number;
      price: number;
      vendor: string;
      requires_shipping: boolean;
      taxable: boolean;
      fulfillment_service: string;
      properties: Record<string, any> | null;
      product_id: number;
      variant_id: number;
    }>;
    currency: string;
    locale: string;
  };
}

interface ShopifyRateResponse {
  rates: Array<{
    service_name: string;
    service_code: string;
    total_price: number;
    description?: string;
    currency: string;
    min_delivery_date?: string;
    max_delivery_date?: string;
  }>;
}

interface ActivationConditions {
  minOrderValue?: number;
  maxOrderValue?: number;
  minWeight?: number;
  maxWeight?: number;
  deliveryZones?: string[];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body: ShopifyRateRequest = await request.json();
    
    const shopDomain = request.headers.get("x-shopify-shop-domain") || 
                       new URL(request.url).searchParams.get("shop");
    
    if (!shopDomain) {
      console.error("No shop domain in carrier service request");
      return json({ rates: [] });
    }

    const settings = await db.settings.findUnique({
      where: { shop: shopDomain }
    });

    const locations = await db.location.findMany({
      where: { 
        shop: shopDomain,
        OR: [{ isPickup: true }, { isDelivery: true }]
      },
      include: {
        rates: true
      }
    });


    const cartTotalCents = body.rate.items.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    );
    const cartTotal = cartTotalCents / 100;
    const cartWeightGrams = body.rate.items.reduce((sum, item) => 
      sum + (item.grams * item.quantity), 0
    );
    const cartWeight = cartWeightGrams / 1000;

    const rates: ShopifyRateResponse['rates'] = [];

    const parseActivationConditions = (
      conditionsStr: string | null | undefined
    ): ActivationConditions => {
      if (!conditionsStr) return {};
      const trimmed = conditionsStr.trim();
      if (!trimmed || trimmed === "{}") return {};

      let jsonString = trimmed;
      const firstBrace = trimmed.indexOf("{");
      const lastBrace = trimmed.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonString = trimmed.slice(firstBrace, lastBrace + 1);
      }

      try {
        return JSON.parse(jsonString) as ActivationConditions;
      } catch (e) {
        console.error("Error parsing activation conditions:", e);
        return {};
      }
    };

    const matchesCartConditions = (conditions: ActivationConditions): boolean => {
      if (conditions.minOrderValue && cartTotal < conditions.minOrderValue) {
        return false;
      }
      if (conditions.maxOrderValue && cartTotal > conditions.maxOrderValue) {
        return false;
      }
      if (conditions.minWeight && cartWeight < conditions.minWeight) {
        return false;
      }
      if (conditions.maxWeight && cartWeight > conditions.maxWeight) {
        return false;
      }
      return true;
    };

    if (settings?.enablePickup) {
      const pickupLocations = locations.filter(loc => {
        if (!loc.isPickup) return false;
        const conditions = parseActivationConditions(loc.pickupActivationConditions);
        return matchesCartConditions(conditions);
      });

      for (const location of pickupLocations) {
        let ratePrice = settings.fallbackRate || 0;
        const pickupRates = location.rates.filter(
          (rate) => (rate as any).method === "PICKUP" || (rate as any).method === "BOTH" || !(rate as any).method,
        );

        const applicableRate = pickupRates.find(rate => {
          if (rate.type === 'PRICE') {
            return cartTotal >= rate.min && (!rate.max || cartTotal <= rate.max);
          } else if (rate.type === 'WEIGHT') {
            return cartWeight >= rate.min && (!rate.max || cartWeight <= rate.max);
          }
          return false;
        });

        if (applicableRate) {
          ratePrice = applicableRate.price;
        } else if (pickupRates.length > 0) {
          continue;
        }

        rates.push({
          service_name: `${settings.pickupTitle || 'Store Pickup'} - ${location.name}`,
          service_code: `pickup_${location.id}`,
          total_price: Math.round(ratePrice * 100),
          description: `Pick up at ${location.address}${location.city ? ', ' + location.city : ''}`,
          currency: body.rate.currency,
        });
      }
    }

    if (settings?.enableDelivery) {
      const customerPostal = body.rate.destination.postal_code?.toUpperCase().replace(/\s/g, "");

      const allDeliveryLocs = locations.filter(loc => loc.isDelivery);
      const anyLocationHasZones = allDeliveryLocs.some(loc => {
        const c = parseActivationConditions(loc.deliveryActivationConditions);
        return c.deliveryZones && c.deliveryZones.length > 0;
      });

      const validationMode = settings.postalCodeValidation || "none";
      const effectiveMode = validationMode === "none" && anyLocationHasZones ? "partial" : validationMode;

      const deliveryLocations = allDeliveryLocs.filter(loc => {
        const conditions = parseActivationConditions(loc.deliveryActivationConditions);

        if (effectiveMode === "none") return true;

        const deliveryZones = conditions.deliveryZones || [];
        if (deliveryZones.length === 0) return !anyLocationHasZones;

        if (effectiveMode === "partial") {
          const prefix = customerPostal?.substring(0, 3) || "";
          return deliveryZones.some(zone => zone.toUpperCase().substring(0, 3) === prefix);
        }

        if (effectiveMode === "full") {
          return deliveryZones.some(
            zone => zone.toUpperCase().replace(/\s/g, "") === customerPostal
          );
        }

        return true;
      });

      for (const location of deliveryLocations) {
        if (cartTotal < 50) {
          continue;
        }

        const fixedDeliveryPrice = cartTotal < 150 ? 10 : 0;

        rates.push({
          service_name: `${settings.deliveryTitle || "Local Delivery"} - ${location.name}`,
          service_code: `delivery_${location.id}`,
          total_price: Math.round(fixedDeliveryPrice * 100),
          description: `Delivery to ${body.rate.destination.city || body.rate.destination.postal_code}`,
          currency: body.rate.currency,
        });
      }
    }

    if (rates.length === 0) {
      return json({ rates: [] });
    }

    return json({ rates });

  } catch (error) {
    console.error("Error calculating carrier service rates:", error);
    return json({ rates: [] });
  }
};

export const loader = async () => {
  return json({
    message: "Carrier Service Rate Callback",
    method: "POST"
  });
};
