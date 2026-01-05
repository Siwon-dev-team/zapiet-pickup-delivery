import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  useIndexResourceState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query getOrders {
      orders(first: 20, reverse: true) {
        edges {
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
      }
    }`
  );

  const data = await response.json();
  
  const orders = data.data.orders.edges.map((edge: any) => {
    const node = edge.node;
    
    // Extract Zapiet-specific attributes
    const attributes = node.customAttributes || [];
    const pickupDate = attributes.find((a: any) => a.key === "Pickup Date")?.value;
    const pickupTime = attributes.find((a: any) => a.key === "Pickup Time")?.value;
    const locationName = attributes.find((a: any) => a.key === "Pickup Location")?.value;
    const method = attributes.find((a: any) => a.key === "Method")?.value || "Shipping"; // "Pickup" or "Delivery"

    return {
      id: node.id,
      name: node.name,
      customer: node.customer ? node.customer.displayName : "Guest",
      date: new Date(node.createdAt).toLocaleDateString(),
      status: node.displayFulfillmentStatus,
      method, 
      pickupDate: pickupDate || "-",
      pickupTime: pickupTime || "",
      locationName: locationName || "-",
    };
  });

  return json({ orders });
};

export default function OrdersPage() {
  const { orders } = useLoaderData<typeof loader>();

  const resourceName = {
    singular: "order",
    plural: "orders",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(orders);

  const rowMarkup = orders.map(
    (
      { id, name, customer, date, status, method, pickupDate, pickupTime, locationName }: any,
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
