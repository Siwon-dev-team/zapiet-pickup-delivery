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
    total_price: number; // in cents
    description?: string;
    currency: string;
    min_delivery_date?: string;
    max_delivery_date?: string;
  }>;
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
    const cartWeight = cartWeightGrams / 1000; // Convert to kg

    const rates: ShopifyRateResponse['rates'] = [];

    const checkActivation = (conditionsStr: string): boolean => {
      if (!conditionsStr || conditionsStr === '{}') return true;
      
      try {
        const conditions = JSON.parse(conditionsStr);
        
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
      } catch (e) {
        console.error("Error parsing activation conditions:", e);
        return true;
      }
    };

    if (settings?.enablePickup && checkActivation(settings.pickupActivationConditions || '{}')) {
      const pickupLocations = locations.filter(loc => loc.isPickup);

      for (const location of pickupLocations) {
        let ratePrice = settings.fallbackRate || 0;
        let rateName = "Free Pickup";

        const applicableRate = location.rates.find(rate => {
          if (rate.type === 'PRICE') {
            return cartTotal >= rate.min && (!rate.max || cartTotal <= rate.max);
          } else if (rate.type === 'WEIGHT') {
            return cartWeight >= rate.min && (!rate.max || cartWeight <= rate.max);
          }
          return false;
        });

        if (applicableRate) {
          ratePrice = applicableRate.price;
          rateName = applicableRate.name;
        } else if (location.rates.length > 0) {
          ratePrice = settings.fallbackRate || 0;
          rateName = ratePrice === 0 ? "Free Pickup" : "Store Pickup";
        }

        rates.push({
          service_name: `${settings.pickupTitle || 'Store Pickup'} - ${location.name}`,
          service_code: `pickup_${location.id}`,
          total_price: Math.round(ratePrice * 100), // Convert to cents
          description: `Pick up at ${location.address}${location.city ? ', ' + location.city : ''}`,
          currency: body.rate.currency,
        });
      }
    }

    if (settings?.enableDelivery && checkActivation(settings.deliveryActivationConditions || '{}')) {
      let deliveryAvailable = true;
      
      if (settings.postalCodeValidation !== 'none') {
        const customerPostal = body.rate.destination.postal_code?.toUpperCase().replace(/\s/g, '');
        
        try {
          const deliveryConditions = JSON.parse(settings.deliveryActivationConditions || '{}');
          const deliveryZones = deliveryConditions.deliveryZones || [];
          
          if (deliveryZones.length > 0) {
            if (settings.postalCodeValidation === 'partial') {
              const prefix = customerPostal?.substring(0, 3) || '';
              deliveryAvailable = deliveryZones.some((zone: string) => 
                zone.toUpperCase().substring(0, 3) === prefix
              );
            } else if (settings.postalCodeValidation === 'full') {
              deliveryAvailable = deliveryZones.some((zone: string) => 
                zone.toUpperCase().replace(/\s/g, '') === customerPostal
              );
            }
          }
        } catch (e) {
          console.error("Error validating postal code:", e);
        }
      }

      if (deliveryAvailable) {
        const deliveryLocations = locations.filter(loc => loc.isDelivery);

        for (const location of deliveryLocations) {
          let ratePrice = settings.fallbackRate || 0;
          let rateName = "Free Delivery";

          const applicableRate = location.rates.find(rate => {
            if (rate.type === 'PRICE') {
              return cartTotal >= rate.min && (!rate.max || cartTotal <= rate.max);
            } else if (rate.type === 'WEIGHT') {
              return cartWeight >= rate.min && (!rate.max || cartWeight <= rate.max);
            }
            return false;
          });

          if (applicableRate) {
            ratePrice = applicableRate.price;
            rateName = applicableRate.name;
          } else if (location.rates.length > 0) {
            ratePrice = settings.fallbackRate || 0;
            rateName = ratePrice === 0 ? "Free Delivery" : "Local Delivery";
          }

          rates.push({
            service_name: `${settings.deliveryTitle || 'Local Delivery'} - ${location.name}`,
            service_code: `delivery_${location.id}`,
            total_price: Math.round(ratePrice * 100), // Convert to cents
            description: `Delivery to ${body.rate.destination.city || body.rate.destination.postal_code}`,
            currency: body.rate.currency,
          });
        }
      }
    }

    if (rates.length === 0) {
      console.log("No rates available for shop:", shopDomain);
      return json({ rates: [] });
    }

    console.log(`Returning ${rates.length} rates for shop: ${shopDomain}`);
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
