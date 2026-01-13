import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

interface CarrierService {
  id: string;
  name: string;
  active: boolean;
  callbackUrl: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    #graphql
    query {
      carrierServices(first: 10) {
        edges {
          node {
            id
            name
            active
            callbackUrl
          }
        }
      }
    }
  `);

  const result = await response.json();
  const carrierServices = result.data?.carrierServices?.edges?.map((edge: any) => edge.node) || [];
  
  const ourCarrierService = carrierServices.find((cs: any) => 
    cs.name === "Zapiet Pickup & Delivery"
  );

  const appUrl = process.env.SHOPIFY_APP_URL || "https://example.com";

  return json({ 
    carrierService: ourCarrierService || null,
    allCarrierServices: carrierServices,
    appUrl: appUrl
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  const appUrl = process.env.SHOPIFY_APP_URL || "https://example.com";
  const callbackUrl = `${appUrl}/api/carrier-service/rates`;

  if (action === "create") {
    const mutation = `
      #graphql
      mutation carrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
        carrierServiceCreate(input: $input) {
          carrierService {
            id
            name
            active
            callbackUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, {
      variables: {
        input: {
          name: "Zapiet Pickup & Delivery",
          callbackUrl: callbackUrl,
          active: true,
          supportsServiceDiscovery: true,
        },
      },
    });

    const result = await response.json();
    
    if (result.data?.carrierServiceCreate?.userErrors?.length > 0) {
      return json({ 
        success: false, 
        errors: result.data.carrierServiceCreate.userErrors 
      });
    }

    return json({ success: true, action: "created" });
  }

  if (action === "update") {
    const carrierId = formData.get("carrierId");
    const activeStatus = formData.get("active") === "true";

    const mutation = `
      #graphql
      mutation carrierServiceUpdate($id: ID!, $input: DeliveryCarrierServiceUpdateInput!) {
        carrierServiceUpdate(id: $id, input: $input) {
          carrierService {
            id
            name
            active
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, {
      variables: {
        id: carrierId,
        input: {
          active: activeStatus,
        },
      },
    });

    const result = await response.json();
    
    if (result.data?.carrierServiceUpdate?.userErrors?.length > 0) {
      return json({ 
        success: false, 
        errors: result.data.carrierServiceUpdate.userErrors 
      });
    }

    return json({ success: true, action: activeStatus ? "activated" : "deactivated" });
  }

  if (action === "delete") {
    const carrierId = formData.get("carrierId");

    const mutation = `
      #graphql
      mutation carrierServiceDelete($id: ID!) {
        carrierServiceDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, {
      variables: {
        id: carrierId,
      },
    });

    const result = await response.json();
    
    if (result.data?.carrierServiceDelete?.userErrors?.length > 0) {
      return json({ 
        success: false, 
        errors: result.data.carrierServiceDelete.userErrors 
      });
    }

    return json({ success: true, action: "deleted" });
  }

  return json({ success: false, errors: [{ message: "Invalid action" }] });
};

export default function CarrierServicePage() {
  const { carrierService, allCarrierServices, appUrl } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const callbackUrl = `${appUrl}/api/carrier-service/rates`;

  return (
    <Page
      title="Carrier Service"
      subtitle="Manage shipping rate integration with Shopify checkout"
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <p>
              <strong>Carrier Service</strong> allows your app to provide custom shipping rates 
              during checkout. Shopify will call your callback URL to calculate rates based on 
              cart contents and delivery address.
            </p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Zapiet Pickup & Delivery Carrier
                  </Text>
                  <Text as="p" tone="subdued">
                    Status: {carrierService ? (
                      <Badge tone={carrierService.active ? "success" : "info"}>
                        {carrierService.active ? "Active" : "Inactive"}
                      </Badge>
                    ) : (
                      <Badge tone="attention">Not Created</Badge>
                    )}
                  </Text>
                </BlockStack>

                {!carrierService ? (
                  <Form method="post">
                    <input type="hidden" name="action" value="create" />
                    <Button 
                      variant="primary" 
                      submit 
                      loading={isSubmitting}
                    >
                      Create Carrier Service
                    </Button>
                  </Form>
                ) : (
                  <InlineStack gap="200">
                    <Form method="post">
                      <input type="hidden" name="action" value="update" />
                      <input type="hidden" name="carrierId" value={carrierService.id} />
                      <input type="hidden" name="active" value={String(!carrierService.active)} />
                      <Button 
                        submit 
                        loading={isSubmitting}
                      >
                        {carrierService.active ? "Deactivate" : "Activate"}
                      </Button>
                    </Form>

                    <Form method="post">
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="carrierId" value={carrierService.id} />
                      <Button 
                        tone="critical"
                        submit 
                        loading={isSubmitting}
                      >
                        Delete
                      </Button>
                    </Form>
                  </InlineStack>
                )}
              </InlineStack>

              {carrierService && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>Callback URL:</strong> <code>{carrierService.callbackUrl}</code>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Carrier ID:</strong> <code>{carrierService.id}</code>
                  </Text>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                How It Works
              </Text>
              
              <BlockStack gap="300">
                <div>
                  <Text as="p" fontWeight="semibold">1. Customer selects pickup/delivery in cart</Text>
                  <Text as="p" tone="subdued">
                    Widget captures location, date, time, and stores in cart attributes
                  </Text>
                </div>

                <div>
                  <Text as="p" fontWeight="semibold">2. Customer proceeds to checkout</Text>
                  <Text as="p" tone="subdued">
                    Shopify calls your callback URL: <code>{callbackUrl}</code>
                  </Text>
                </div>

                <div>
                  <Text as="p" fontWeight="semibold">3. Your app calculates shipping rates</Text>
                  <Text as="p" tone="subdued">
                    Based on cart attributes (method, location, weight, price), return appropriate rates
                  </Text>
                </div>

                <div>
                  <Text as="p" fontWeight="semibold">4. Customer completes order</Text>
                  <Text as="p" tone="subdued">
                    Shipping rate is applied, order webhook processes pickup/delivery details
                  </Text>
                </div>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {allCarrierServices.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  All Carrier Services ({allCarrierServices.length})
                </Text>
                
                <BlockStack gap="200">
                  {allCarrierServices.map((cs: CarrierService) => (
                    <div key={cs.id} style={{ 
                      padding: "12px", 
                      background: "#f6f6f7", 
                      borderRadius: "8px" 
                    }}>
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text as="p" fontWeight="semibold">{cs.name}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {cs.callbackUrl}
                          </Text>
                        </BlockStack>
                        <Badge tone={cs.active ? "success" : "info"}>
                          {cs.active ? "Active" : "Inactive"}
                        </Badge>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Banner tone="warning">
            <p>
              <strong>Important:</strong> Make sure your SHOPIFY_APP_URL environment variable 
              is set correctly. Current callback URL: <code>{callbackUrl}</code>
            </p>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
