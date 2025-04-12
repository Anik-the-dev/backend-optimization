import { createAdminApiClient } from "@shopify/admin-api-client";
import {
  connectMongoDB,
  disconnectMongoDB,
  isConnected
} from "../db/database.js";
import { getShopifyStoreData } from "./store.js";

export const createShopifyClient = async storeId => {
  const dbConnected = isConnected();
  if (!dbConnected) {
    await connectMongoDB();
  }
  const { api_pass, shop_name } = await getShopifyStoreData(storeId);
  const client = createAdminApiClient({
    storeDomain: shop_name,
    apiVersion: "2025-01",
    accessToken: api_pass
  });
  if (!dbConnected) {
    await disconnectMongoDB();
  }
  return client;
};
