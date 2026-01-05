import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  IndexTable,
  Modal,
  FormLayout,
  TextField,
  Select,
  InlineStack,
  Badge,
  Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const locations = await db.location.findMany({
    where: { shop },
    include: { rates: true },
    orderBy: { name: "asc" },
  });

  return json({ locations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;

  try {
    if (action === "create_rate" || action === "update_rate") {
      const id = formData.get("id") as string;
      const locationId = formData.get("locationId") as string;
      const name = formData.get("name") as string;
      const type = formData.get("type") as string;
      const min = parseFloat(formData.get("min") as string);
      const max = formData.get("max") ? parseFloat(formData.get("max") as string) : null;
      const price = parseFloat(formData.get("price") as string);

      const data = { locationId, name, type, min, max, price };

      if (action === "create_rate") {
        await db.rate.create({ data });
        return json({ success: true, message: "Rate created" });
      } else {
        await db.rate.update({ where: { id }, data });
        return json({ success: true, message: "Rate updated" });
      }
    }

    if (action === "delete_rate") {
      const rateId = formData.get("rateId") as string;
      const rate = await db.rate.findUnique({ 
        where: { id: rateId },
        include: { location: true }
      });
      
      if (rate && rate.location.shop === session.shop) {
        await db.rate.delete({ where: { id: rateId } });
        return json({ success: true, message: "Rate deleted" });
      }
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Rate action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

type FetcherData = {
  success?: boolean;
  message?: string;
  error?: string;
};

export default function RatesPage() {
  const { locations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<FetcherData>();
  
  const [activeModal, setActiveModal] = useState(false);
  const [editingRate, setEditingRate] = useState<any>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // Form state
  const [rateName, setRateName] = useState("");
  const [rateType, setRateType] = useState("PRICE");
  const [minVal, setMinVal] = useState("0");
  const [maxVal, setMaxVal] = useState("");
  const [price, setPrice] = useState("0");

  const handleOpenModal = (locationId: string, rate?: any) => {
    setSelectedLocationId(locationId);
    
    if (rate) {
      // Edit mode
      setEditingRate(rate);
      setRateName(rate.name);
      setRateType(rate.type);
      setMinVal(String(rate.min));
      setMaxVal(rate.max ? String(rate.max) : "");
      setPrice(String(rate.price));
    } else {
      // Create mode
      setEditingRate(null);
      setRateName("");
      setRateType("PRICE");
      setMinVal("0");
      setMaxVal("");
      setPrice("0");
    }
    
    setActiveModal(true);
  };

  const handleCloseModal = () => {
    setActiveModal(false);
    setEditingRate(null);
    setSelectedLocationId(null);
  };

  const handleSaveRate = () => {
    if (!selectedLocationId) return;
    
    const formData = new FormData();
    formData.append("_action", editingRate ? "update_rate" : "create_rate");
    if (editingRate) {
      formData.append("id", editingRate.id);
    }
    formData.append("locationId", selectedLocationId);
    formData.append("name", rateName);
    formData.append("type", rateType);
    formData.append("min", minVal);
    if (maxVal) formData.append("max", maxVal);
    formData.append("price", price);

    fetcher.submit(formData, { method: "post" });
    handleCloseModal();
  };

  const handleDeleteRate = (rateId: string) => {
    if (confirm("Delete this rate?")) {
      const formData = new FormData();
      formData.append("_action", "delete_rate");
      formData.append("rateId", rateId);
      fetcher.submit(formData, { method: "post" });
    }
  };

  return (
    <Page title="Shipping Rates">
      <Layout>
        <Layout.Section>
          {fetcher.data?.success && (
            <Banner tone="success" onDismiss={() => {}}>
              <p>{fetcher.data.message}</p>
            </Banner>
          )}
          
          {fetcher.data?.error && (
            <Banner tone="critical" onDismiss={() => {}}>
              <p>{fetcher.data.error}</p>
            </Banner>
          )}
        </Layout.Section>

        {locations.map((loc) => (
          <Layout.Section key={loc.id}>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">{loc.name}</Text>
                    <InlineStack gap="200">
                      {loc.isPickup && <Badge tone="info">Pickup</Badge>}
                      {loc.isDelivery && <Badge tone="success">Delivery</Badge>}
                    </InlineStack>
                  </BlockStack>
                  <Button onClick={() => handleOpenModal(loc.id)}>
                    Add Rate
                  </Button>
                </InlineStack>
                
                {loc.rates.length > 0 ? (
                  <IndexTable
                    resourceName={{ singular: "rate", plural: "rates" }}
                    itemCount={loc.rates.length}
                    headings={[
                      { title: "Name" },
                      { title: "Type" },
                      { title: "Condition" },
                      { title: "Price" },
                      { title: "Actions" }
                    ]}
                    selectable={false}
                  >
                    {loc.rates.map((rate, index) => (
                      <IndexTable.Row id={rate.id} key={rate.id} position={index}>
                        <IndexTable.Cell>
                          <Text fontWeight="semibold" as="span">{rate.name}</Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge>{rate.type}</Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {rate.min} - {rate.max ?? "∞"}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {rate.price === 0 ? (
                            <Badge tone="success">FREE</Badge>
                          ) : (
                            `$${rate.price.toFixed(2)}`
                          )}
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="200">
                            <Button size="slim" onClick={() => handleOpenModal(loc.id, rate)}>
                              Edit
                            </Button>
                            <Button size="slim" tone="critical" onClick={() => handleDeleteRate(rate.id)}>
                              Delete
                            </Button>
                          </InlineStack>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                ) : (
                  <Text as="p" tone="subdued">No rates configured for this location.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        ))}
      </Layout>

      <Modal
        open={activeModal}
        onClose={handleCloseModal}
        title={editingRate ? "Edit Shipping Rate" : "Add Shipping Rate"}
        primaryAction={{
          content: editingRate ? "Update" : "Add Rate",
          onAction: handleSaveRate,
          disabled: !rateName,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCloseModal,
          }
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField 
              label="Rate Name" 
              value={rateName} 
              onChange={setRateName} 
              autoComplete="off"
              placeholder="e.g., Standard Pickup, Express Delivery"
              requiredIndicator
            />
            
            <Select
              label="Type"
              options={[
                { label: "Price Based", value: "PRICE" },
                { label: "Weight Based", value: "WEIGHT" },
              ]}
              value={rateType}
              onChange={setRateType}
              helpText={rateType === "PRICE" ? "Based on cart total" : "Based on total weight"}
            />
            
            <InlineStack gap="400">
              <TextField 
                label="Minimum" 
                type="number" 
                value={minVal} 
                onChange={setMinVal} 
                autoComplete="off"
                helpText={rateType === "PRICE" ? "$" : "kg"}
              />
              <TextField 
                label="Maximum (optional)" 
                type="number" 
                value={maxVal} 
                onChange={setMaxVal} 
                autoComplete="off"
                placeholder="Leave empty for no limit"
              />
            </InlineStack>
            
            <TextField 
              label="Shipping Cost" 
              type="number" 
              value={price} 
              onChange={setPrice} 
              autoComplete="off" 
              prefix="$"
              helpText="Set to 0 for free shipping"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
