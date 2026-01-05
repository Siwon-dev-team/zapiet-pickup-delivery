import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Button,
  Badge,
  Text,
  Modal,
  TextField,
  Checkbox,
  BlockStack,
  InlineStack,
  Banner,
  Filters,
  ChoiceList,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState, useMemo } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const locations = await db.location.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  return json({ locations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("_action") as string;

  try {
    if (action === "delete") {
      const id = formData.get("id") as string;
      await db.location.deleteMany({
        where: { id, shop: session.shop },
      });
      return json({ success: true, message: "Location deleted" });
    }

    if (action === "create" || action === "update") {
      const id = formData.get("id") as string;
      const name = formData.get("name") as string;
      const address = formData.get("address") as string;
      const city = formData.get("city") as string;
      const zip = formData.get("zip") as string;
      const country = formData.get("country") as string;
      const isPickup = formData.get("isPickup") === "true";
      const isDelivery = formData.get("isDelivery") === "true";
      const businessHours = formData.get("businessHours") as string;

      if (!name) {
        return json({ error: "Name is required" }, { status: 400 });
      }

      const data = {
        shop: session.shop,
        name,
        address: address || "",
        city: city || "",
        zip: zip || "",
        country: country || "",
        isPickup,
        isDelivery,
        businessHours: businessHours || "{}",
      };

      if (action === "create") {
        await db.location.create({ data });
        return json({ success: true, message: "Location created" });
      } else {
        await db.location.update({
          where: { id },
          data,
        });
        return json({ success: true, message: "Location updated" });
      }
    }

    if (action === "duplicate") {
      const id = formData.get("id") as string;
      const original = await db.location.findUnique({ where: { id } });
      
      if (original && original.shop === session.shop) {
        const { id: _, createdAt, updatedAt, ...data } = original;
        await db.location.create({
          data: {
            ...data,
            name: `${data.name} (Copy)`,
          },
        });
        return json({ success: true, message: "Location duplicated" });
      }
    }

    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Location action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

type FetcherData = {
  success?: boolean;
  message?: string;
  error?: string;
};

export default function LocationsPage() {
  const { locations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<FetcherData>();

  // Modal state
  const [modalActive, setModalActive] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [isPickup, setIsPickup] = useState(true);
  const [isDelivery, setIsDelivery] = useState(false);
  const [businessHours, setBusinessHours] = useState("{}");
  const [showAdvancedHours, setShowAdvancedHours] = useState(false);

  // Search/Filter state
  const [queryValue, setQueryValue] = useState("");
  const [pickupFilter, setPickupFilter] = useState<string[]>([]);
  const [deliveryFilter, setDeliveryFilter] = useState<string[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleOpenModal = (location?: any) => {
    if (location) {
      // Edit mode
      setEditingLocation(location);
      setName(location.name);
      setAddress(location.address || "");
      setCity(location.city || "");
      setZip(location.zip || "");
      setCountry(location.country || "");
      setIsPickup(location.isPickup);
      setIsDelivery(location.isDelivery);
      setBusinessHours(location.businessHours || "{}");
    } else {
      // Create mode
      setEditingLocation(null);
      setName("");
      setAddress("");
      setCity("");
      setZip("");
      setCountry("");
      setIsPickup(true);
      setIsDelivery(false);
      setBusinessHours("{}");
    }
    setModalActive(true);
  };

  const handleCloseModal = () => {
    setModalActive(false);
    setEditingLocation(null);
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("_action", editingLocation ? "update" : "create");
    if (editingLocation) {
      formData.append("id", editingLocation.id);
    }
    formData.append("name", name);
    formData.append("address", address);
    formData.append("city", city);
    formData.append("zip", zip);
    formData.append("country", country);
    formData.append("isPickup", String(isPickup));
    formData.append("isDelivery", String(isDelivery));
    formData.append("businessHours", businessHours);

    fetcher.submit(formData, { method: "post" });
    handleCloseModal();
  };

  const handleDuplicate = (location: any) => {
    if (confirm(`Duplicate "${location.name}"?`)) {
      const formData = new FormData();
      formData.append("_action", "duplicate");
      formData.append("id", location.id);
      fetcher.submit(formData, { method: "post" });
    }
  };

  // Filter locations
  const filteredLocations = useMemo(() => {
    return locations.filter((location) => {
      // Search filter
      const matchesQuery = queryValue === "" || 
        location.name.toLowerCase().includes(queryValue.toLowerCase()) ||
        (location.address || "").toLowerCase().includes(queryValue.toLowerCase());

      // Pickup filter
      const matchesPickup = pickupFilter.length === 0 ||
        (pickupFilter.includes("enabled") && location.isPickup) ||
        (pickupFilter.includes("disabled") && !location.isPickup);

      // Delivery filter
      const matchesDelivery = deliveryFilter.length === 0 ||
        (deliveryFilter.includes("enabled") && location.isDelivery) ||
        (deliveryFilter.includes("disabled") && !location.isDelivery);

      return matchesQuery && matchesPickup && matchesDelivery;
    });
  }, [locations, queryValue, pickupFilter, deliveryFilter]);
  
  // Paginated locations
  const paginatedLocations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredLocations.slice(startIndex, endIndex);
  }, [filteredLocations, currentPage, itemsPerPage]);
  
  const totalPages = Math.ceil(filteredLocations.length / itemsPerPage);

  const handleQueryClear = () => setQueryValue("");
  const handlePickupFilterRemove = () => setPickupFilter([]);
  const handleDeliveryFilterRemove = () => setDeliveryFilter([]);
  const handleFiltersClearAll = () => {
    setQueryValue("");
    setPickupFilter([]);
    setDeliveryFilter([]);
  };

  const filters = [
    {
      key: "pickup",
      label: "Pickup",
      filter: (
        <ChoiceList
          title="Pickup Status"
          titleHidden
          choices={[
            { label: "Enabled", value: "enabled" },
            { label: "Disabled", value: "disabled" },
          ]}
          selected={pickupFilter}
          onChange={setPickupFilter}
          allowMultiple
        />
      ),
      shortcut: true,
    },
    {
      key: "delivery",
      label: "Delivery",
      filter: (
        <ChoiceList
          title="Delivery Status"
          titleHidden
          choices={[
            { label: "Enabled", value: "enabled" },
            { label: "Disabled", value: "disabled" },
          ]}
          selected={deliveryFilter}
          onChange={setDeliveryFilter}
          allowMultiple
        />
      ),
    },
  ];

  const appliedFilters = [];
  if (pickupFilter.length > 0) {
    appliedFilters.push({
      key: "pickup",
      label: `Pickup: ${pickupFilter.join(", ")}`,
      onRemove: handlePickupFilterRemove,
    });
  }
  if (deliveryFilter.length > 0) {
    appliedFilters.push({
      key: "delivery",
      label: `Delivery: ${deliveryFilter.join(", ")}`,
      onRemove: handleDeliveryFilterRemove,
    });
  }

  const resourceName = {
    singular: "location",
    plural: "locations",
  };

  const rowMarkup = paginatedLocations.map(
    (location, index) => (
      <IndexTable.Row id={location.id} key={location.id} position={index}>
        <IndexTable.Cell>
          <Button variant="plain" onClick={() => handleOpenModal(location)}>
            {location.name}
          </Button>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {location.address || "-"}
          {location.city && `, ${location.city}`}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {location.isPickup ? (
            <Badge tone="success">Enabled</Badge>
          ) : (
            <Badge>Disabled</Badge>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {location.isDelivery ? (
            <Badge tone="success">Enabled</Badge>
          ) : (
            <Badge>Disabled</Badge>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200">
            <Button size="slim" onClick={() => handleDuplicate(location)}>
              Duplicate
            </Button>
            <Button
              size="slim"
              tone="critical"
              onClick={() => {
                if (confirm(`Delete "${location.name}"?`)) {
                  const formData = new FormData();
                  formData.append("_action", "delete");
                  formData.append("id", location.id);
                  fetcher.submit(formData, { method: "post" });
                }
              }}
            >
              Delete
            </Button>
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <Page
      title="Locations"
      primaryAction={{
        content: "Add Location",
        onAction: () => handleOpenModal(),
      }}
    >
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

          <Card padding="0">
            <div style={{ padding: "16px" }}>
              <Filters
                queryValue={queryValue}
                filters={filters}
                appliedFilters={appliedFilters}
                onQueryChange={setQueryValue}
                onQueryClear={handleQueryClear}
                onClearAll={handleFiltersClearAll}
                queryPlaceholder="Search locations..."
              />
            </div>
            
            {filteredLocations.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <Text as="p" tone="subdued">
                  {locations.length === 0 
                    ? "No locations yet. Click 'Add Location' to get started."
                    : "No locations match your search."}
                </Text>
              </div>
            ) : (
              <>
                <IndexTable
                  resourceName={resourceName}
                  itemCount={filteredLocations.length}
                  headings={[
                    { title: "Name" },
                    { title: "Address" },
                    { title: "Pickup" },
                    { title: "Delivery" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
                
                {filteredLocations.length > itemsPerPage && (
                  <div style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <InlineStack gap="200" align="center">
                        <Text as="span">Items per page:</Text>
                        <select 
                          value={itemsPerPage} 
                          onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #c9cccf" }}
                        >
                          <option value="5">5</option>
                          <option value="10">10</option>
                          <option value="25">25</option>
                          <option value="50">50</option>
                        </select>
                        <Text as="span" tone="subdued">
                          Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredLocations.length)} of {filteredLocations.length}
                        </Text>
                      </InlineStack>
                    </div>
                    
                    <InlineStack gap="200">
                      <Button 
                        disabled={currentPage === 1} 
                        onClick={() => setCurrentPage(currentPage - 1)}
                      >
                        Previous
                      </Button>
                      <Text as="span" variant="bodySm">
                        Page {currentPage} of {totalPages}
                      </Text>
                      <Button 
                        disabled={currentPage === totalPages} 
                        onClick={() => setCurrentPage(currentPage + 1)}
                      >
                        Next
                      </Button>
                    </InlineStack>
                  </div>
                )}
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalActive}
        onClose={handleCloseModal}
        title={editingLocation ? "Edit Location" : "Add New Location"}
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          disabled: !name,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handleCloseModal,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Location Name"
              value={name}
              onChange={setName}
              autoComplete="off"
              placeholder="e.g., Main Store"
              requiredIndicator
            />

            <TextField
              label="Address"
              value={address}
              onChange={setAddress}
              placeholder="123 Main Street"
              autoComplete="street-address"
            />

            <InlineStack gap="300">
              <TextField 
                label="City" 
                value={city} 
                onChange={setCity} 
                placeholder="Ottawa"
                autoComplete="address-level2"
              />
              <TextField 
                label="Zip" 
                value={zip} 
                onChange={setZip} 
                placeholder="K1A 0A9"
                autoComplete="postal-code"
              />
              <TextField 
                label="Country" 
                value={country} 
                onChange={setCountry} 
                placeholder="Canada"
                autoComplete="country-name"
              />
            </InlineStack>

            <Checkbox
              label="Enable Store Pickup"
              checked={isPickup}
              onChange={setIsPickup}
            />

            <Checkbox
              label="Enable Local Delivery"
              checked={isDelivery}
              onChange={setIsDelivery}
            />

            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingSm">Business Hours</Text>
                <Button 
                  variant="plain" 
                  onClick={() => setShowAdvancedHours(!showAdvancedHours)}
                >
                  {showAdvancedHours ? "Simple mode" : "Advanced (JSON)"}
                </Button>
              </InlineStack>
              
              {showAdvancedHours ? (
                <TextField
                  label=""
                  value={businessHours}
                  onChange={setBusinessHours}
                  multiline={4}
                  placeholder='{"monday":"09:00-17:00","tuesday":"09:00-17:00"}'
                  helpText="JSON format - day: start-end (HH:MM format)"
                  autoComplete="off"
                />
              ) : (
                <BlockStack gap="200">
                  <TextField
                    label="Quick Setup"
                    placeholder="e.g., 9:00 AM - 5:00 PM"
                    helpText="Set standard hours for all days (or use Advanced mode)"
                    autoComplete="off"
                    onBlur={(e) => {
                      if (e && e.target) {
                        const value = (e.target as HTMLInputElement).value;
                        if (value) {
                          const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
                          const hours: any = {};
                          days.forEach(day => hours[day] = "09:00-17:00");
                          setBusinessHours(JSON.stringify(hours));
                        }
                      }
                    }}
                  />
                  <Text as="p" tone="subdued" variant="bodySm">
                    Current: {businessHours === "{}" ? "Not set" : "Custom hours configured"}
                  </Text>
                </BlockStack>
              )}
            </BlockStack>

            {editingLocation && (
              <Text as="p" tone="subdued" variant="bodySm">
                Location ID: {editingLocation.id}
              </Text>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
