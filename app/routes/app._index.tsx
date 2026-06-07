import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  List,
  Link,
  InlineStack,
  Badge,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

async function ensureCarrierService(admin: any): Promise<boolean> {
  try {
    const response = await admin.graphql(`
      #graphql
      query { carrierServices(first: 10) { edges { node { id name active callbackUrl } } } }
    `);
    const result = await response.json();
    const services = result.data?.carrierServices?.edges?.map((e: any) => e.node) || [];
    const ours = services.find((cs: any) => cs.name === "Zapiet Pickup & Delivery");

    if (ours) return ours.active;

    const appUrl = process.env.SHOPIFY_APP_URL || "";
    if (!appUrl) return false;

    const createResp = await admin.graphql(`
      #graphql
      mutation carrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
        carrierServiceCreate(input: $input) {
          carrierService { id active }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          name: "Zapiet Pickup & Delivery",
          callbackUrl: `${appUrl}/api/carrier-service/rates`,
          active: true,
          supportsServiceDiscovery: true,
        },
      },
    });
    const createResult = await createResp.json();
    return !!createResult.data?.carrierServiceCreate?.carrierService?.active;
  } catch (e) {
    console.error("Carrier service auto-setup failed:", e);
    return false;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const [locationsTotal, pickupLocations, deliveryLocations, ratesTotal, settings, recentLocations, carrierServiceActive] =
    await Promise.all([
      db.location.count({ where: { shop } }),
      db.location.count({ where: { shop, isPickup: true } }),
      db.location.count({ where: { shop, isDelivery: true } }),
      db.rate.count({ where: { location: { shop } } }),
      db.settings.findUnique({ where: { shop } }),
      db.location.findMany({
        where: { shop },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          isPickup: true,
          isDelivery: true,
          updatedAt: true,
        },
      }),
      ensureCarrierService(admin),
    ]);

  return json({
    shop,
    summary: {
      locationsTotal,
      pickupLocations,
      deliveryLocations,
      ratesTotal,
      pickupEnabled: settings?.enablePickup ?? true,
      deliveryEnabled: settings?.enableDelivery ?? false,
      carrierServiceActive,
    },
    recentLocations,
  });
};

export default function Index() {
  const { shop, summary, recentLocations } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Zapiet Dashboard" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Store
                </Text>
                <Text as="p" variant="bodyMd">
                  {shop}
                </Text>
                <InlineStack gap="200">
                  <Badge tone={summary.pickupEnabled ? "success" : "warning"}>
                    Pickup {summary.pickupEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Badge tone={summary.deliveryEnabled ? "success" : "warning"}>
                    Delivery {summary.deliveryEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Locations
                </Text>
                <Text as="p" variant="heading2xl">
                  {summary.locationsTotal}
                </Text>
                <Text as="p" tone="subdued">
                  Pickup: {summary.pickupLocations} • Delivery: {summary.deliveryLocations}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Rates
                </Text>
                <Text as="p" variant="heading2xl">
                  {summary.ratesTotal}
                </Text>
                <Text as="p" tone="subdued">
                  Active rules configured for local delivery and pickup coverage.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Reports Snapshot
                </Text>
                <List>
                  <List.Item>Total configured locations: {summary.locationsTotal}</List.Item>
                  <List.Item>Pickup-enabled locations: {summary.pickupLocations}</List.Item>
                  <List.Item>Delivery-enabled locations: {summary.deliveryLocations}</List.Item>
                  <List.Item>Total rate rules: {summary.ratesTotal}</List.Item>
                </List>
                <Divider />
                <InlineStack gap="300">
                  <Button url="/app/locations">Manage locations</Button>
                  <Button url="/app/rates">Manage rates</Button>
                  <Button url="/app/settings" variant="plain">
                    Open settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Setup Guides
                  </Text>
                  <List>
                    <List.Item>Step 1: Add and configure locations.</List.Item>
                    <List.Item>Step 2: Create rate rules per location.</List.Item>
                    <List.Item>Step 3: Set widget behavior in Settings.</List.Item>
                    <List.Item>Step 4: Enable app embed in your theme.</List.Item>
                  </List>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Help & Resources
                  </Text>
                  <List>
                    <List.Item>
                      <Link
                        url="https://help.shopify.com/en/manual/fulfillment/setup/shipping-rates"
                        target="_blank"
                        removeUnderline
                      >
                        Shopify shipping rates setup
                      </Link>{" "}
                      guide
                    </List.Item>
                    <List.Item>
                      <Link
                        url="https://shopify.dev/docs/apps/checkout/delivery-shipping/local-pickup-delivery"
                        target="_blank"
                        removeUnderline
                      >
                        Local pickup and local delivery docs
                      </Link>
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Recently Updated Locations
                  </Text>
                  {recentLocations.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No locations configured yet.
                    </Text>
                  ) : (
                    <List>
                      {recentLocations.map((location) => (
                        <List.Item key={location.id}>
                          {location.name}{" "}
                          <Text as="span" tone="subdued">
                            ({location.isPickup ? "Pickup" : ""}{location.isPickup && location.isDelivery ? " / " : ""}{location.isDelivery ? "Delivery" : ""})
                          </Text>
                        </List.Item>
                      ))}
                    </List>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
