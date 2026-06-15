import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Banner,
  Button,
  Select,
  InlineStack,
  Pagination,
  useIndexResourceState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useMemo, useState } from "react";

type DayFilter = "all" | "7" | "14" | "30";
type FulfillmentFilter =
  | "all"
  | "UNFULFILLED"
  | "FULFILLED"
  | "PARTIALLY_FULFILLED";

type RawOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string;
  customAttributes?: Array<{ key: string; value: string }>;
};

type RowOrder = {
  id: string;
  name: string;
  customer: string;
  date: string;
  status: string;
  method: "Pickup" | "Delivery" | "Shipping";
  pickupDate: string;
  pickupTime: string;
  locationName: string;
};

const ORDER_QUERY = `#graphql
  query getOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, reverse: true) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          displayFulfillmentStatus
          customAttributes {
            key
            value
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function normalizeMethod(rawMethod?: string): "Pickup" | "Delivery" | "Shipping" {
  if (!rawMethod) return "Shipping";
  const normalized = rawMethod.toLowerCase();
  if (normalized.startsWith("pickup")) return "Pickup";
  if (normalized.startsWith("delivery")) return "Delivery";
  return "Shipping";
}

function toDayThreshold(days: DayFilter): Date | null {
  if (days === "all") return null;
  const parsed = Number(days);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - parsed);
  threshold.setHours(0, 0, 0, 0);
  return threshold;
}

function matchesFulfillment(
  status: string,
  filter: FulfillmentFilter,
): boolean {
  if (filter === "all") return true;
  return status === filter;
}

function mapOrderNode(node: RawOrderNode): RowOrder {
  const attributes = node.customAttributes || [];
  const pickupDate = attributes.find((a) => a.key === "Pickup Date")?.value;
  const pickupTime = attributes.find((a) => a.key === "Pickup Time")?.value;
  const locationName = attributes.find((a) => a.key === "Pickup Location")?.value;
  const methodRaw = attributes.find((a) => a.key === "Method")?.value;
  const method = normalizeMethod(methodRaw);

  return {
    id: node.id,
    name: node.name,
    customer: attributes.find((a) => a.key === "Customer")?.value || "-",
    date: new Date(node.createdAt).toLocaleDateString(),
    status: node.displayFulfillmentStatus,
    method,
    pickupDate: pickupDate || "-",
    pickupTime: pickupTime || "",
    locationName: locationName || "-",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const daysParam = (url.searchParams.get("days") || "all") as DayFilter;
  const fulfillmentParam = (url.searchParams.get("fulfillment") ||
    "all") as FulfillmentFilter;

  const daysFilter: DayFilter = ["all", "7", "14", "30"].includes(daysParam)
    ? daysParam
    : "all";
  const fulfillmentFilter: FulfillmentFilter = [
    "all",
    "UNFULFILLED",
    "FULFILLED",
    "PARTIALLY_FULFILLED",
  ].includes(fulfillmentParam)
    ? fulfillmentParam
    : "all";

  const emptyResult = (error: string) =>
    json({ orders: [] as RowOrder[], error, filters: { days: daysFilter, fulfillment: fulfillmentFilter } });

  let admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"];
  try {
    const auth = await authenticate.admin(request);
    admin = auth.admin;
  } catch (err: unknown) {
    if (err instanceof Response) throw err;
    console.error("Orders auth error:", err);
    return emptyResult("Authentication failed. Please reload the page.");
  }

  const dayThreshold = toDayThreshold(daysFilter);
  const collectedOrders: RowOrder[] = [];
  let afterCursor: string | null = null;
  let hasNextPage = true;
  let stopPagination = false;
  let loadError: string | null = null;
  const MAX_PAGES = 5;

  try {
    for (let page = 0; page < MAX_PAGES && hasNextPage && !stopPagination; page++) {
      const response = await admin.graphql(ORDER_QUERY, {
        variables: { first: 50, after: afterCursor },
      });

      if (!response.ok) {
        console.error("Orders API HTTP error:", response.status, response.statusText);
        loadError = `Shopify API returned ${response.status}. Please reinstall the app if this persists.`;
        break;
      }

      let data: any;
      try {
        data = await response.json();
      } catch {
        console.error("Orders: failed to parse API response");
        loadError = "Invalid response from Shopify API.";
        break;
      }

      if (data.errors) {
        console.error("Orders GraphQL errors:", JSON.stringify(data.errors));
        loadError = data.errors.map((e: any) => e.message).join("; ");
        break;
      }

      const connection = data?.data?.orders;
      if (!connection) {
        loadError = "Unable to load orders. The app may need additional permissions.";
        break;
      }

      const edges = connection.edges || [];

      for (const edge of edges) {
        const node = edge.node as RawOrderNode;
        const createdAt = new Date(node.createdAt);

        if (dayThreshold && createdAt < dayThreshold) {
          stopPagination = true;
          break;
        }

        if (!matchesFulfillment(node.displayFulfillmentStatus, fulfillmentFilter)) {
          continue;
        }

        collectedOrders.push(mapOrderNode(node));
      }

      hasNextPage = !!connection.pageInfo?.hasNextPage;
      afterCursor = connection.pageInfo?.endCursor || null;
    }
  } catch (err: unknown) {
    if (err instanceof Response) throw err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Orders loader error:", err);
    loadError = msg || "Failed to load orders";
  }

  return json({
    orders: collectedOrders,
    error: loadError,
    filters: {
      days: daysFilter,
      fulfillment: fulfillmentFilter,
    },
  });
};

export default function OrdersPage() {
  const { orders, filters, error } = useLoaderData<typeof loader>();
  const [currentPage, setCurrentPage] = useState(1);
  const ORDERS_PER_PAGE = 50;

  const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOrders = useMemo(() => {
    const start = (safeCurrentPage - 1) * ORDERS_PER_PAGE;
    return orders.slice(start, start + ORDERS_PER_PAGE);
  }, [orders, safeCurrentPage]);
  const startItem =
    orders.length === 0 ? 0 : (safeCurrentPage - 1) * ORDERS_PER_PAGE + 1;
  const endItem =
    orders.length === 0
      ? 0
      : Math.min(safeCurrentPage * ORDERS_PER_PAGE, orders.length);

  const resourceName = {
    singular: "order",
    plural: "orders",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(paginatedOrders);

  const rowMarkup = paginatedOrders.map(
    (
      { id, name, customer, date, status, method, pickupDate, pickupTime, locationName }: RowOrder,
      index: number
    ) => (
      <IndexTable.Row
        id={id}
        key={id}
        selected={selectedResources.includes(id)}
        position={index}
      >
        <IndexTable.Cell>
          <Text fontWeight="bold" as="span">
            {name}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{date}</IndexTable.Cell>
        <IndexTable.Cell>{customer}</IndexTable.Cell>
        <IndexTable.Cell>
          {method === "Pickup" ? (
            <Badge tone="info">Store Pickup</Badge>
          ) : method === "Delivery" ? (
            <Badge tone="success">Local Delivery</Badge>
          ) : (
            <Badge>Standard Shipping</Badge>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
            {locationName === "-" ? (
                <Text as="span" tone="subdued">{locationName}</Text>
            ) : (
                <Text as="span">{locationName}</Text>
            )}
        </IndexTable.Cell>
        <IndexTable.Cell>
            {pickupDate !== "-" ? (
                <span>{pickupDate} <br/><Text as="span" tone="subdued" variant="bodySm">{pickupTime}</Text></span>
            ) : (
                <Text as="span" tone="subdued">-</Text>
            )}
        </IndexTable.Cell>
        <IndexTable.Cell>
            <Badge>{status}</Badge>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <Page title="Store Orders">
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Could not load orders">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card>
            <Form method="get">
              <InlineStack gap="300" align="start" blockAlign="end">
                <div style={{ minWidth: 200 }}>
                  <Select
                    label="Date range"
                    name="days"
                    options={[
                      { label: "All time", value: "all" },
                      { label: "Last 7 days", value: "7" },
                      { label: "Last 14 days", value: "14" },
                      { label: "Last 30 days", value: "30" },
                    ]}
                    value={filters.days}
                    onChange={() => {}}
                  />
                </div>
                <div style={{ minWidth: 240 }}>
                  <Select
                    label="Fulfillment"
                    name="fulfillment"
                    options={[
                      { label: "All statuses", value: "all" },
                      { label: "Unfulfilled", value: "UNFULFILLED" },
                      { label: "Partially fulfilled", value: "PARTIALLY_FULFILLED" },
                      { label: "Fulfilled", value: "FULFILLED" },
                    ]}
                    value={filters.fulfillment}
                    onChange={() => {}}
                  />
                </div>
                <Button submit variant="primary">
                  Apply filters
                </Button>
              </InlineStack>
            </Form>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={paginatedOrders.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Order" },
                { title: "Date" },
                { title: "Customer" },
                { title: "Method" },
                { title: "Location" },
                { title: "Scheduled For" },
                { title: "Fulfillment" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
          <div style={{ marginTop: 16 }}>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="p" tone="subdued">
                Showing {startItem}
                {" - "}
                {endItem}
                {" of "}
                {orders.length} orders
              </Text>
              <Pagination
                hasPrevious={safeCurrentPage > 1}
                onPrevious={() =>
                  setCurrentPage((prev) => Math.max(1, prev - 1))
                }
                hasNext={safeCurrentPage < totalPages}
                onNext={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
              />
            </InlineStack>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
