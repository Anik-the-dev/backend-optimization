import { Types } from "mongoose";
import { StoreModel } from "../db/models/store.js";

const getStoreDataWithStoreId = async (storeId, fields = []) => {
  const result = await StoreModel.findOne({
    _id: new Types.ObjectId(String(storeId))
  }).select([...fields]);

  console.table({
    shopName: result?.shopName,
    ID: result?._id?.toString(),
    LOCATIONS: JSON.stringify(result?.locations)
  });
  return result;
};

export const getShopifyStoreData = async (storeId, multiple = false) => {
  const result = await getStoreDataWithStoreId(storeId, [
    "apiKey",
    "apiPass",
    "shopName",
    "locations"
  ]);

  if (!result._id) {
    throw new Error("Please provide valid data to create client");
  }
  if (multiple) {
    return {
      api_key: result.apiKey,
      api_pass: result.apiPass,
      shop_name: result.shopName,
      api_version: "2024-10",
      // if multiple locations are needed, then return all locations as an array of objects
      locations: result.locations
    };
  }
  return {
    api_key: result.apiKey,
    api_pass: result.apiPass,
    shop_name: result.shopName,
    api_version: "2024-10",
    // if single location is needed, then return the location id
    locationId: result.locations[0].id
  };
};
