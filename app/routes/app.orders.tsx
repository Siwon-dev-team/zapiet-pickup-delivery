import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  Select,
  InlineStack,
  useIndexResourceState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

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
  customer?: { displayName?: string | null } | null;
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
          customer {
            displayName
          }
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
    customer: node.customer?.displayName || "Guest",
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

  const dayThreshold = toDayThreshold(daysFilter);
  const { admin } = await authenticate.admin(request);

  const collectedOrders: RowOrder[] = [];
  let afterCursor: string | null = null;
  let hasNextPage = true;
  let stopPagination = false;
  const MAX_PAGES = 8;

  for (let page = 0; page < MAX_PAGES && hasNextPage && !stopPagination; page++) {
    const response = await admin.graphql(ORDER_QUERY, {
      variables: { first: 250, after: afterCursor },
    });
    const data = await response.json();
    const connection = data?.data?.orders;
    const edges = connection?.edges || [];

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

    hasNextPage = !!connection?.pageInfo?.hasNextPage;
    afterCursor = connection?.pageInfo?.endCursor || null;
  }

  return json({
    orders: collectedOrders,
    filters: {
      days: daysFilter,
      fulfillment: fulfillmentFilter,
    },
  });
};

export default function OrdersPage() {
  const { orders, filters } = useLoaderData<typeof loader>();

  const resourceName = {
    singular: "order",
    plural: "orders",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(orders);

  const rowMarkup = orders.map(
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
              itemCount={orders.length}
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
        </Layout.Section>
      </Layout>
    </Page>
  );
}
