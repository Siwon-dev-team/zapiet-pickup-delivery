import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import type { Settings } from "@prisma/client";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ 
      error: "Missing shop param"
    }, { 
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      }
    });
  }

  try {
  const settings = await db.settings.findUnique({ where: { shop } }) as Settings | null;
  
  const sortOrder = (settings as any)?.locationSortOrder || "newest";
  let orderBy: any = { createdAt: "desc" };
    
    if (sortOrder === "oldest") {
      orderBy = { createdAt: "asc" };
    } else if (sortOrder === "alphabetical") {
      orderBy = { name: "asc" };
    } else if (sortOrder === "reverse-alphabetical") {
      orderBy = { name: "desc" };
  }
  
  const locations = await db.location.findMany({
      where: { 
          shop,
          OR: [{ isPickup: true }, { isDelivery: true }]
      },
      orderBy
  });
  
  const rates = await db.rate.findMany({
      where: { 
        location: { shop }
      },
      select: {
        id: true,
        locationId: true,
        name: true,
        type: true,
        min: true,
        max: true,
        price: true
      }
    });

    const s = settings as any;
    
    return json({
      settings: {
          enablePickup: s?.enablePickup ?? true,
          enableDelivery: s?.enableDelivery ?? false,
          pickupTitle: s?.pickupTitle ?? "Store Pickup",
          deliveryTitle: s?.deliveryTitle ?? "Local Delivery",
          primaryColor: s?.primaryColor ?? "#008060",
          logoUrl: s?.logoUrl ?? "",
          pickupActivationConditions: s?.pickupActivationConditions ?? "{}",
          deliveryActivationConditions: s?.deliveryActivationConditions ?? "{}",
          postalCodeValidation: s?.postalCodeValidation ?? "none",
          enablePickupNote: s?.enablePickupNote ?? false,
          enableDeliveryNote: s?.enableDeliveryNote ?? false,
          preselectLocation: s?.preselectLocation ?? "",
          fallbackRate: s?.fallbackRate ?? 0,
          deliveryTimeSlots: s?.deliveryTimeSlots ?? "9:00 AM - 12:00 PM,12:00 PM - 3:00 PM,3:00 PM - 6:00 PM,5:00 PM - 11:00 PM",
      },
      locations,
      rates
    }, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
        }
    });
  } catch (error) {
    return json({ 
      error: "Database error"
    }, { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      }
    });
  }
};

