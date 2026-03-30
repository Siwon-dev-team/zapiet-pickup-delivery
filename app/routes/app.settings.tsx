import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useNavigation, useActionData, useFetcher } from "@remix-run/react";
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
  Button,
  InlineStack,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const ZAPIET_DELIVERY_CUSTOMIZATION_TITLE = "Zapiet Delivery Customization";

async function getDeliveryFunctionId(admin: any): Promise<string | null> {
  try {
    const response = await admin.graphql(
      `#graphql
      query ZapietDeliveryFunctions {
        shopifyFunctions(first: 100) {
          nodes {
            id
            title
            apiType
          }
        }
      }`,
    );
    const data = await response.json();
    const nodes = data?.data?.shopifyFunctions?.nodes || [];
    const match = nodes.find(
      (node: any) =>
        String(node?.apiType || "").toUpperCase() === "DELIVERY_CUSTOMIZATION" &&
        String(node?.title || "")
          .toLowerCase()
          .includes("zapiet"),
    );
    return match?.id || null;
  } catch (error) {
    console.error("Delivery function lookup failed:", error);
    return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
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
        enablePickupNote: true,
        enableDeliveryNote: true,
        preselectLocation: "",
        locationSortOrder: "newest",
        fallbackRate: 0,
        deliveryTimeSlots: "9:00 AM - 12:00 PM,12:00 PM - 3:00 PM,3:00 PM - 6:00 PM,5:00 PM - 11:00 PM",
        enablePickupNextWeekOnly: false,
        pickupNextWeekSameWeekDays: "[]",
        enableDeliveryNextWeekOnly: false,
        deliveryNextWeekSameWeekDays: "[]",
      } as any,
    });
  }

  let customizationId: string | null = null;
  let customizationEnabled = false;
  let customizationTitle = ZAPIET_DELIVERY_CUSTOMIZATION_TITLE;

  try {
    const response = await admin.graphql(
      `#graphql
      query ZapietDeliveryCustomizationStatus {
        deliveryCustomizations(first: 50) {
          nodes {
            id
            title
            enabled
          }
        }
      }`,
    );
    const data = await response.json();
    const nodes = data?.data?.deliveryCustomizations?.nodes || [];
    const match = nodes.find(
      (node: any) =>
        String(node?.title || "").toLowerCase().includes("zapiet"),
    );
    if (match) {
      customizationId = match.id;
      customizationEnabled = !!match.enabled;
      customizationTitle = match.title || customizationTitle;
    }
  } catch (error) {
    console.error("Delivery customization status check failed:", error);
  }

  return json({
    settings,
    deliveryCustomization: {
      id: customizationId,
      enabled: customizationEnabled,
      title: customizationTitle,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const submittedAction = (formData.get("_action") as string) || "save_settings";

  if (submittedAction === "toggle_delivery_customization") {
    const desiredEnabled = formData.get("enabled") === "true";
    const existingId = (formData.get("id") as string) || "";

    try {
      if (existingId) {
        const updateResponse = await admin.graphql(
          `#graphql
          mutation ZapietDeliveryCustomizationUpdate($id: ID!, $enabled: Boolean!) {
            deliveryCustomizationUpdate(id: $id, deliveryCustomization: { enabled: $enabled }) {
              deliveryCustomization {
                id
                enabled
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              id: existingId,
              enabled: desiredEnabled,
            },
          },
        );

        const updateData = await updateResponse.json();
        const errors =
          updateData?.data?.deliveryCustomizationUpdate?.userErrors || [];
        if (errors.length > 0) {
          return json(
            { error: errors[0]?.message || "Failed to update delivery customization" },
            { status: 400 },
          );
        }

        return json({
          success: true,
          message: desiredEnabled
            ? "Delivery customization enabled."
            : "Delivery customization disabled.",
        });
      }

      if (!desiredEnabled) {
        return json({
          success: true,
          message: "Delivery customization is already disabled.",
        });
      }

      const functionId = await getDeliveryFunctionId(admin);
      if (!functionId) {
        return json(
          { error: "Zapiet delivery function was not found. Please deploy the app and try again." },
          { status: 400 },
        );
      }

      const createResponse = await admin.graphql(
        `#graphql
        mutation ZapietDeliveryCustomizationCreate($title: String!, $enabled: Boolean!, $functionId: String!) {
          deliveryCustomizationCreate(deliveryCustomization: {
            title: $title
            enabled: $enabled
            functionId: $functionId
          }) {
            deliveryCustomization {
              id
              enabled
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            title: ZAPIET_DELIVERY_CUSTOMIZATION_TITLE,
            enabled: desiredEnabled,
            functionId,
          },
        },
      );

      const createData = await createResponse.json();
      const errors =
        createData?.data?.deliveryCustomizationCreate?.userErrors || [];
      if (errors.length > 0) {
        return json(
          { error: errors[0]?.message || "Failed to create delivery customization" },
          { status: 400 },
        );
      }

      return json({
        success: true,
        message: desiredEnabled
          ? "Delivery customization enabled."
          : "Delivery customization disabled.",
      });
    } catch (error: any) {
      console.error("Delivery customization toggle failed:", error);
      return json(
        { error: error?.message || "Failed to toggle delivery customization" },
        { status: 500 },
      );
    }
  }

  const enableOrderNote = formData.get("enableOrderNote") === "on";
  
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
    enablePickupNote: enableOrderNote,
    enableDeliveryNote: enableOrderNote,
    preselectLocation: formData.get("preselectLocation") as string,
    locationSortOrder: formData.get("locationSortOrder") as string,
    fallbackRate: parseFloat(formData.get("fallbackRate") as string) || 0,
    enablePickupNextWeekOnly: formData.get("enablePickupNextWeekOnly") === "on",
    pickupNextWeekSameWeekDays: formData.get("pickupNextWeekSameWeekDays") as string || "[]",
  };

  await db.settings.upsert({
    where: { shop: session.shop },
    update: data,
    create: { ...data, shop: session.shop },
  });

  return json({ success: true, message: "Settings saved successfully." });
};

export default function SettingsPage() {
  const { settings: settingsData, deliveryCustomization } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const customizationFetcher = useFetcher<{
    success?: boolean;
    message?: string;
    error?: string;
  }>();
  const settings = settingsData as any;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const isTogglingCustomization = customizationFetcher.state !== "idle";

  const [enablePickup, setEnablePickup] = useState(settings.enablePickup);
  const [enableDelivery, setEnableDelivery] = useState(settings.enableDelivery);
  const [enableSecurityCode, setEnableSecurityCode] = useState(settings.enableSecurityCode);
  const [enableOrderNote, setEnableOrderNote] = useState(
    (settings.enablePickupNote || settings.enableDeliveryNote) || false
  );
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
  const [enablePickupNextWeekOnly, setEnablePickupNextWeekOnly] = useState(settings.enablePickupNextWeekOnly || false);
  const [pickupNextWeekSameWeekDays, setPickupNextWeekSameWeekDays] = useState(settings.pickupNextWeekSameWeekDays || "[]");

  const handleSubmit = () => {
    const form = document.querySelector('form');
    if (form) form.requestSubmit();
  };

  const handleToggleCustomization = (enabled: boolean) => {
    const formData = new FormData();
    formData.append("_action", "toggle_delivery_customization");
    formData.append("enabled", String(enabled));
    if (deliveryCustomization?.id) {
      formData.append("id", deliveryCustomization.id);
    }
    customizationFetcher.submit(formData, { method: "post" });
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
          {actionData && "success" in actionData && actionData.success && (
            <Layout.Section>
              <Banner tone="success">
                <p>{actionData.message || "Settings saved successfully."}</p>
              </Banner>
            </Layout.Section>
          )}
          {customizationFetcher.data?.success && (
            <Layout.Section>
              <Banner tone="success">
                <p>{customizationFetcher.data.message}</p>
              </Banner>
            </Layout.Section>
          )}
          {customizationFetcher.data?.error && (
            <Layout.Section>
              <Banner tone="critical">
                <p>{customizationFetcher.data.error}</p>
              </Banner>
            </Layout.Section>
          )}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Checkout Delivery Customization</Text>
                <Text as="p" tone="subdued">
                  Status: {deliveryCustomization?.enabled ? "Enabled" : "Disabled"}
                </Text>
                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    onClick={() => handleToggleCustomization(true)}
                    disabled={deliveryCustomization?.enabled || isTogglingCustomization}
                    loading={isTogglingCustomization && !deliveryCustomization?.enabled}
                  >
                    Enable
                  </Button>
                  <Button
                    tone="critical"
                    onClick={() => handleToggleCustomization(false)}
                    disabled={!deliveryCustomization?.enabled || isTogglingCustomization}
                    loading={isTogglingCustomization && !!deliveryCustomization?.enabled}
                  >
                    Disable
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
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
                  label="Enable Order Note"
                  checked={enableOrderNote}
                  onChange={setEnableOrderNote}
                  helpText="Show one shared order note field in the widget. Turn this off if your theme already has an order note input."
                />
                <input type="hidden" name="enableOrderNote" value={enableOrderNote ? "on" : "off"} />

                <Divider />

                <Text as="h3" variant="headingSm">Pickup Next Week Only</Text>

                {enablePickupNextWeekOnly && (
                  <Banner tone="warning">
                    <p><strong>Important:</strong> This setting can enforce pickup date minimum at 7+ days for non-exception days.</p>
                  </Banner>
                )}

                <Checkbox
                  label="Enable Pickup Next Week Only"
                  checked={enablePickupNextWeekOnly}
                  onChange={setEnablePickupNextWeekOnly}
                  helpText="Force all pickups to be scheduled for next week (except for selected same-week days)"
                />
                <input type="hidden" name="enablePickupNextWeekOnly" value={enablePickupNextWeekOnly ? "on" : "off"} />

                {enablePickupNextWeekOnly && (
                  <>
                    <Banner tone="info">
                      <p>Select which days allow same-week pickup. All other days will require next week pickup.</p>
                    </Banner>

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Same-Week Pickup Days:</Text>
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                        const dayLower = day.toLowerCase();
                        let selectedDays: string[] = [];
                        try {
                          selectedDays = JSON.parse(pickupNextWeekSameWeekDays);
                        } catch (e) {
                          selectedDays = [];
                        }
                        const isChecked = selectedDays.includes(dayLower);

                        return (
                          <Checkbox
                            key={day}
                            label={day}
                            checked={isChecked}
                            onChange={(checked) => {
                              const current = [...selectedDays];
                              if (checked) {
                                if (!current.includes(dayLower)) {
                                  current.push(dayLower);
                                }
                              } else {
                                const index = current.indexOf(dayLower);
                                if (index > -1) {
                                  current.splice(index, 1);
                                }
                              }
                              setPickupNextWeekSameWeekDays(JSON.stringify(current));
                            }}
                          />
                        );
                      })}
                    </BlockStack>
                  </>
                )}
                <input type="hidden" name="pickupNextWeekSameWeekDays" value={pickupNextWeekSameWeekDays} />
                
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
                  label="Auto-Tag Delivery Orders"
                  name="autoTagDelivery"
                  value={autoTagDelivery}
                  onChange={setAutoTagDelivery}
                  autoComplete="off"
                  placeholder="delivery, local-delivery"
                  helpText="Comma-separated tags to add to delivery orders"
                />
                
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

        </Layout>
      </Form>
    </Page>
  );
}
