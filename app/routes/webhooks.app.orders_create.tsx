import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    return new Response();
  }

  const order = payload as any;
  
  // Get app settings (type cast to avoid Prisma LSP cache issues)
  const settings = await db.settings.findUnique({
    where: { shop }
  }) as any;

  // Extract order attributes
  const attributes = order.note_attributes || [];
  const methodAttr = attributes.find((a: any) => a.name === "Method");
  const isPickup = methodAttr && methodAttr.value === "Pickup";
  const isDelivery = methodAttr && methodAttr.value === "Delivery";

  let newTags: string[] = [];
  let newAttributes = [...attributes];
  let updateInput: any = {
    id: `gid://shopify/Order/${order.id}`,
  };

  // Process Pickup Orders
  if (isPickup) {
    // Auto-tag pickup orders
    if (settings?.autoTagPickup) {
      const tags = settings.autoTagPickup.split(',').map((t: string) => t.trim()).filter(Boolean);
      newTags.push(...tags);
    }

    // Find location and update address
    const locationNameAttr = attributes.find((a: any) => a.name === "Pickup Location");
    if (locationNameAttr) {
      const location = await db.location.findFirst({
        where: { shop, name: locationNameAttr.value }
      });

      if (location) {
        // Update shipping address to match store
        updateInput.shippingAddress = {
          address1: location.address,
          city: location.city,
          zip: location.zip,
          country: location.country,
          first_name: order.shipping_address?.first_name || "Store",
          last_name: order.shipping_address?.last_name || "Pickup",
        };

        // Generate security code if enabled
        if (settings?.enableSecurityCode) {
          const securityCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          newAttributes.push({ name: "Security Code", value: securityCode });
        }
      }
    }
  }

  // Process Delivery Orders
  if (isDelivery) {
    // Auto-tag delivery orders
    if (settings?.autoTagDelivery) {
      const tags = settings.autoTagDelivery.split(',').map((t: string) => t.trim()).filter(Boolean);
      newTags.push(...tags);
    }
  }

  // Combine existing tags with new tags
  const existingTags = order.tags ? order.tags.split(',').map((t: string) => t.trim()) : [];
  const allTags = [...new Set([...existingTags, ...newTags])];
  
  if (allTags.length > 0) {
    updateInput.tags = allTags.join(', ');
  }

  // Update custom attributes if changed
  if (newAttributes.length !== attributes.length) {
    updateInput.customAttributes = newAttributes;
  }
  
  // Append pickup/delivery notes to order note
  const pickupNote = attributes.find((a: any) => a.name === "Pickup Note")?.value;
  const deliveryNote = attributes.find((a: any) => a.name === "Delivery Note")?.value;
  
  if ((pickupNote || deliveryNote) && (settings?.enablePickupNote || settings?.enableDeliveryNote)) {
    const existingNote = order.note || "";
    const noteToAdd = pickupNote || deliveryNote;
    const notePrefix = pickupNote ? "Pickup Note: " : "Delivery Note: ";
    
    if (!existingNote.includes(noteToAdd)) {
      updateInput.note = existingNote 
        ? `${existingNote}\n\n${notePrefix}${noteToAdd}` 
        : `${notePrefix}${noteToAdd}`;
    }
  }

  // Only update if we have changes
  if (Object.keys(updateInput).length > 1) {
    const query = `#graphql
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          userErrors {
            field
            message
          }
          order {
            id
            tags
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: { input: updateInput }
    });

    const result = await response.json();
    
    if (result.data?.orderUpdate?.userErrors?.length > 0) {
      console.error("Order update errors:", result.data.orderUpdate.userErrors);
    }
  }

  return new Response();
};

