export const SHOPIFY_GRAPHQL_QUERIES = {
  FETCH_BULK_OPERATION: `#graphql
    query fetchBulkOperation($operationId: ID!) {
        node(id: $operationId) {
        ... on BulkOperation {
          id
          status
          objectCount
          errorCode
          partialDataUrl
          type
          fileSize
          url
          partialDataUrl
        }
      }
    }
  `,
};

export const SHOPIFY_GRAPHQL_MUTATION = {
  CREATE_BULK_OPERATION_FOR_ORDERS: `#graphql
    mutation {
        bulkOperationRunQuery(
            query: """
            {
            orders {
                edges {
                node {
                    id
                }
                }
            }
            }
            """
        ) {
            bulkOperation {
            id
            status
            }
            userErrors {
            field
            message
            }
        }
        }
`,
  DELETE_ORDER: `#graphql
    mutation orderDelete($orderId:ID!){
        orderDelete(orderId:$orderId){
            deletedId
            userErrors{
            field
            message
            }
        }
    }
`,
};
