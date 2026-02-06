import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  TextField,
  Checkbox,
  BlockStack,
  Text,
  Divider,
  Banner,
  Select,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await db.settings.findUnique({
    where: { shop },
  });

  if (!settings) {
    settings = await db.settings.create({
      data: {
        shop,
        enablePickup: true,
        enableDelivery: false,
        pickupTitle: "Store Pickup",
        deliveryTitle: "Local Delivery",
        primaryColor: "#008060",
        logoUrl: "",
        pickupActivationConditions: "{}",
        deliveryActivationConditions: "{}",
        autoTagPickup: "",
        autoTagDelivery: "",
        enableSecurityCode: true,
        postalCodeValidation: "none",
        enablePickupNote: false,
        enableDeliveryNote: false,
        preselectLocation: "",
        locationSortOrder: "newest",
        fallbackRate: 0,
        deliveryTimeSlots: "9:00 AM - 12:00 PM,12:00 PM - 3:00 PM,3:00 PM - 6:00 PM,5:00 PM - 11:00 PM",
        enableDeliveryNextWeekOnly: false,
        deliveryNextWeekSameWeekDays: "[]",
      } as any,
    });
  }

  return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const data = {
    enablePickup: formData.get("enablePickup") === "on",
    enableDelivery: formData.get("enableDelivery") === "on",
    pickupTitle: formData.get("pickupTitle") as string,
    deliveryTitle: formData.get("deliveryTitle") as string,
    primaryColor: formData.get("primaryColor") as string,
    logoUrl: formData.get("logoUrl") as string,
    autoTagPickup: formData.get("autoTagPickup") as string,
    autoTagDelivery: formData.get("autoTagDelivery") as string,
    enableSecurityCode: formData.get("enableSecurityCode") === "on",
    postalCodeValidation: formData.get("postalCodeValidation") as string,
    enablePickupNote: formData.get("enablePickupNote") === "on",
    enableDeliveryNote: formData.get("enableDeliveryNote") === "on",
    preselectLocation: formData.get("preselectLocation") as string,
    locationSortOrder: formData.get("locationSortOrder") as string,
    fallbackRate: parseFloat(formData.get("fallbackRate") as string) || 0,
    deliveryTimeSlots: formData.get("deliveryTimeSlots") as string,
    enableDeliveryNextWeekOnly: formData.get("enableDeliveryNextWeekOnly") === "on",
    deliveryNextWeekSameWeekDays: formData.get("deliveryNextWeekSameWeekDays") as string || "[]",
  };

  await db.settings.upsert({
    where: { shop: session.shop },
    update: data,
    create: { ...data, shop: session.shop },
  });

  return json({ success: true });
};

export default function SettingsPage() {
  const { settings: settingsData } = useLoaderData<typeof loader>();
  const settings = settingsData as any;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Controlled state for all form fields
  const [enablePickup, setEnablePickup] = useState(settings.enablePickup);
  const [enableDelivery, setEnableDelivery] = useState(settings.enableDelivery);
  const [enableSecurityCode, setEnableSecurityCode] = useState(settings.enableSecurityCode);
  const [enablePickupNote, setEnablePickupNote] = useState(settings.enablePickupNote || false);
  const [enableDeliveryNote, setEnableDeliveryNote] = useState(settings.enableDeliveryNote || false);
  const [pickupTitle, setPickupTitle] = useState(settings.pickupTitle || "Store Pickup");
  const [deliveryTitle, setDeliveryTitle] = useState(settings.deliveryTitle || "Local Delivery");
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor || "#008060");
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || "");
  const [autoTagPickup, setAutoTagPickup] = useState(settings.autoTagPickup || "");
  const [autoTagDelivery, setAutoTagDelivery] = useState(settings.autoTagDelivery || "");
  const [preselectLocation, setPreselectLocation] = useState(settings.preselectLocation || "");
  const [locationSortOrder, setLocationSortOrder] = useState(settings.locationSortOrder || "newest");
  const [postalCodeValidation, setPostalCodeValidation] = useState(settings.postalCodeValidation || "none");
  const [fallbackRate, setFallbackRate] = useState(String(settings.fallbackRate || 0));
  const [deliveryTimeSlots, setDeliveryTimeSlots] = useState(
    settings.deliveryTimeSlots ||
      "9:00 AM - 12:00 PM,12:00 PM - 3:00 PM,3:00 PM - 6:00 PM,5:00 PM - 11:00 PM"
  );

  const handleSubmit = () => {
    const form = document.querySelector('form');
    if (form) form.requestSubmit();
  };

  return (
    <Page 
      title="Settings"
      primaryAction={{
        content: isSubmitting ? "Saving..." : "Save Settings",
        onAction: handleSubmit,
        loading: isSubmitting,
      }}
    >
      <Form method="post">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">Store Pickup Settings</Text>
                
                <Checkbox
                  label="Enable Store Pickup"
                  checked={enablePickup}
                  onChange={setEnablePickup}
                />
                <input type="hidden" name="enablePickup" value={enablePickup ? "on" : "off"} />
                
                <TextField
                  label="Pickup Title"
                  name="pickupTitle"
                  value={pickupTitle}
                  onChange={setPickupTitle}
                  autoComplete="off"
                  helpText="This will appear as the option name during checkout"
                />
                
                <TextField
                  label="Auto-Tag Pickup Orders"
                  name="autoTagPickup"
                  value={autoTagPickup}
                  onChange={setAutoTagPickup}
                  autoComplete="off"
                  placeholder="pickup, store-pickup"
                  helpText="Comma-separated tags to add to pickup orders"
                />
                
                <Checkbox
                  label="Enable Pickup Security Code"
                  checked={enableSecurityCode}
                  onChange={setEnableSecurityCode}
                  helpText="Generates a unique code for each pickup order for verification"
                />
                <input type="hidden" name="enableSecurityCode" value={enableSecurityCode ? "on" : "off"} />
                
                <Checkbox
                  label="Enable Pickup Note"
                  checked={enablePickupNote}
                  onChange={setEnablePickupNote}
                  helpText="Allow customers to add pickup notes (written to Shopify order notes)"
                />
                <input type="hidden" name="enablePickupNote" value={enablePickupNote ? "on" : "off"} />
                
                <Divider />
                
                <Text as="h3" variant="headingSm">Location Settings</Text>
                
                <Select
                  label="Preselect Default Location"
                  name="preselectLocation"
                  options={[
                    { label: "None (customer must choose)", value: "" },
                    { label: "First available location", value: "first" },
                    { label: "Nearest to customer", value: "nearest" },
                  ]}
                  value={preselectLocation}
                  onChange={setPreselectLocation}
                  helpText="Pre-select a location in the widget"
                />
                
                <Select
                  label="Location Sort Order"
                  name="locationSortOrder"
                  options={[
                    { label: "Newest first", value: "newest" },
                    { label: "Oldest first", value: "oldest" },
                    { label: "Alphabetical (A-Z)", value: "alphabetical" },
                    { label: "Reverse alphabetical (Z-A)", value: "reverse-alphabetical" },
                  ]}
                  value={locationSortOrder}
                  onChange={setLocationSortOrder}
                  helpText="Order locations appear in widget dropdown"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">Local Delivery Settings</Text>
                
                <Checkbox
                  label="Enable Local Delivery"
                  checked={enableDelivery}
                  onChange={setEnableDelivery}
                />
                <input type="hidden" name="enableDelivery" value={enableDelivery ? "on" : "off"} />
                
                <TextField
                  label="Delivery Title"
                  name="deliveryTitle"
                  value={deliveryTitle}
                  onChange={setDeliveryTitle}
                  autoComplete="off"
                  helpText="This will appear as the option name during checkout"
                />
                
                <Select
                  label="Postal Code Validation"
                  name="postalCodeValidation"
                  options={[
                    { label: "No validation", value: "none" },
                    { label: "Partial match (first 3 characters)", value: "partial" },
                    { label: "Full match (exact postal code)", value: "full" },
                  ]}
                  value={postalCodeValidation}
                  onChange={setPostalCodeValidation}
                  helpText="Validate customer postal code against delivery zones"
                />

                <TextField
                  label="Delivery Time Slots"
                  name="deliveryTimeSlots"
                  value={deliveryTimeSlots}
                  onChange={setDeliveryTimeSlots}
                  autoComplete="off"
                  helpText="Comma-separated time ranges shown in the delivery dropdown"
                  placeholder="9:00 AM - 12:00 PM, 12:00 PM - 3:00 PM"
                />
                
                <TextField
                  label="Auto-Tag Delivery Orders"
                  name="autoTagDelivery"
                  value={autoTagDelivery}
                  onChange={setAutoTagDelivery}
                  autoComplete="off"
                  placeholder="delivery, local-delivery"
                  helpText="Comma-separated tags to add to delivery orders"
                />
                
                <Checkbox
                  label="Enable Delivery Note"
                  checked={enableDeliveryNote}
                  onChange={setEnableDeliveryNote}
                  helpText="Allow customers to add delivery notes (written to Shopify order notes)"
                />
                <input type="hidden" name="enableDeliveryNote" value={enableDeliveryNote ? "on" : "off"} />
                
                <Divider />
                
                <Text as="h3" variant="headingSm">Delivery Next Week Only</Text>
                <Checkbox
                  label="Enable Delivery Next Week Only"
                  checked={enableDeliveryNextWeekOnly}
                  onChange={setEnableDeliveryNextWeekOnly}
                  helpText="Force all deliveries to be scheduled for next week (except for selected same-week days)"
                />
                <input type="hidden" name="enableDeliveryNextWeekOnly" value={enableDeliveryNextWeekOnly ? "on" : "off"} />
                <input type="hidden" name="deliveryNextWeekSameWeekDays" value={deliveryNextWeekSameWeekDays} />
                
                {enableDeliveryNextWeekOnly && (
                  <Banner tone="info">
                    <p>Select which days allow same-week delivery. All other days will require next week delivery.</p>
                  </Banner>
                )}
                
                <Divider />
                
                <Text as="h3" variant="headingSm">Fall-back Rate</Text>
                <TextField
                  label="Default Shipping Rate"
                  name="fallbackRate"
                  type="number"
                  prefix="$"
                  value={fallbackRate}
                  onChange={setFallbackRate}
                  helpText="Used when no rate rules match (0 = free)"
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">Appearance</Text>
                
                <TextField
                  label="Primary Color (Hex)"
                  name="primaryColor"
                  value={primaryColor}
                  onChange={setPrimaryColor}
                  autoComplete="off"
                  placeholder="#008060"
                  helpText="Used for buttons and highlights in the widget (e.g., #008060)"
                />
                
                <TextField
                  label="Logo URL"
                  name="logoUrl"
                  value={logoUrl}
                  onChange={setLogoUrl}
                  autoComplete="off"
                  placeholder="https://example.com/logo.png"
                  helpText="Logo to display in the widget (optional)"
                />
                
                <Banner tone="info">
                  <p>
                    <strong>Widget Preview:</strong> The widget will use these settings on your storefront cart page.
                  </p>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Integration Guide</Text>
                
                <BlockStack gap="300">
                  <div>
                    <Text as="p" fontWeight="semibold">Activation Conditions:</Text>
                    <Text as="p" tone="subdued">
                      Conditions are configured per location. Use the Locations page to set pickup
                      and delivery limits with the simple form inputs.
                    </Text>
                  </div>
                  
                  <div>
                    <Text as="p" fontWeight="semibold">Sample Data For Testing:</Text>
                    <Text as="p" tone="subdued">
                      Use the sample values below to quickly trigger pickup and delivery in the widget.
                    </Text>
                    <div style={{
                      background: "#f6f6f7",
                      padding: "12px",
                      borderRadius: "8px",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      marginTop: "8px"
                    }}>
                      <div>Sample address: 45585 Luckakuck Way, Chilliwack, BC V2R 1A1</div>
                      <div>Sample order total: $29.99+</div>
                      <div>Sample delivery zone: V2R (partial) or V2R 1A1 (full)</div>
                      <div>Sample pickup time slot: 5:00 PM - 11:00 PM</div>
                    </div>
                  </div>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
