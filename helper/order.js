import { Types } from "mongoose";
import { OrderModel } from "../db/models/order.js";

const dbBulkUploadChunkSize =
  parseInt(process.env.DB_UPLOAD_CHUNK_SIZE, 10) || 1000;

const uploadBulkToDBOptimized = async (allOrders, storeId) => {
  try {
    const CHUNK_SIZE = dbBulkUploadChunkSize; // Adjustable for memory and performance
    let processedCount = 0;

    for (let i = 0; i < allOrders.length; i += CHUNK_SIZE) {
      const chunk = allOrders.slice(i, i + CHUNK_SIZE);

      // Fetch existing unique IDs in this chunk
      const uniqueIds = chunk.map(order => order.uniqueId);
      const existingUniqueIds = await OrderModel.find({
        storeId: new Types.ObjectId(storeId),
        uniqueId: { $in: uniqueIds }
      }).distinct("uniqueId");

      console.log(
        `Fetched ${existingUniqueIds.length} existing unique IDs for this chunk.`
      );

      // Filter out duplicates
      const filteredOrders = chunk.filter(
        order => !existingUniqueIds.includes(order.uniqueId)
      );

      console.log(
        `Filtered ${chunk.length - filteredOrders.length} duplicate orders.`
      );

      // Prepare bulk operations for filtered orders
      const bulkOperations = filteredOrders.map(order => ({
        insertOne: {
          document: { ...order, storeId: new Types.ObjectId(storeId) }
        }
      }));

      // Execute bulk insert
      if (bulkOperations.length > 0) {
        const result = await OrderModel.bulkWrite(bulkOperations);
        processedCount += result.insertedCount;
        console.log(`Inserted ${result.insertedCount} new orders.`);
      } else {
        console.log("No new orders to insert in this chunk.");
      }
    }

    return {
      success: true,
      message: `Finished processing ${processedCount} unique orders.`,
      data: null
    };
  } catch (error) {
    console.error("Bulk upload failed:", error);
    return { success: false, message: error.message, data: null };
  }
};
const uploadOrderBulkToDB = async (allOrders, storeId) => {
  try {
    const modifiedPayload = allOrders.map(elem => {
      return {
        insertOne: {
          document: { ...elem, storeId: new Types.ObjectId(String(storeId)) }
        }
      };
    });
    const result = await OrderModel.bulkWrite(modifiedPayload);
    return { success: true, message: "Finished", data: result };
  } catch (e) {
    console.log(e);
    return { success: false, message: e.message, data: null };
  }
};

const getOrderByUniqueId = async (uniqueId, storeId) => {
  try {
    const order = await OrderModel.findOne({
      uniqueId: uniqueId,
      storeId: new Types.ObjectId(storeId)
    });
    return order;
  } catch (error) {
    console.log(error);
  }
};

/**
 * Bulk updates orders by setting their "shouldCancel" field to false.
 *
 * Updates all orders whose IDs are included in the provided array and match the specified store ID.
 * On success, it returns the result of the update operation; on failure, it logs the error and
 * returns an object with a success flag set to false and an error message.
 *
 * @param {Array} orderIds - Array of order IDs to update.
 * @param {string} storeId - Identifier of the store (converted to an ObjectId for the query).
 * @returns {Promise<Object>} The update result or an error object with a success flag and message.
 */
async function setShouldCancelBulk(orderIds, storeId) {
  try {
    const result = await OrderModel.updateMany(
      { _id: { $in: orderIds }, storeId: new Types.ObjectId(storeId) },
      { $set: { shouldCancel: false } }
    );

    return result;
  } catch (error) {
    console.error("Error updating orders:", error);
    return { success: false, message: error?.message };
  }
}
/**
 * Retrieves orders by their unique IDs for a given store.
 *
 * This function queries the database for orders that match any of the provided unique IDs and belong
 * to the specified store. It returns documents containing only the `uniqueId` field. If an error occurs
 * during the query, it logs the error and returns an empty array.
 *
 * @param {string[]} orderIds - Array of unique order IDs to search for.
 * @param {string} storeId - Identifier of the store; converted to an ObjectId for querying.
 * @returns {Promise<Array<{ uniqueId: string }>>} A promise that resolves to an array of objects with the `uniqueId` field.
 */
async function getExistingOrdersByIds(orderIds, storeId) {
  try {
    return await OrderModel.find(
      { uniqueId: { $in: orderIds }, storeId: new Types.ObjectId(storeId) },
      { uniqueId: 1 }
    ).lean();
  } catch (error) {
    console.error("Error fetching orders by IDs:", error);
    return [];
  }
}

async function bulkDeleteOrdersByShopifyId(shopifyIds) {
  try {
    // Ensure that shopifyIds is an array
    if (!Array.isArray(shopifyIds)) {
      throw new Error("shopifyIds must be an array");
    }

    // Perform the bulk update to set shopifyId to null
    const result = await OrderModel.updateMany(
      { shopifyId: { $in: shopifyIds } }, // Find the orders with the given shopifyIds
      { $set: { shopifyId: null } } // Set shopifyId to null
    );

    console.log(`Successfully updated ${result.modifiedCount} orders`);

    return result;
  } catch (error) {
    console.error("Error during bulk delete:", error);
    throw error;
  }
}

export const OrderHelper = {
  uploadBulkToDBOptimized,
  uploadOrderBulkToDB,
  getOrderByUniqueId,
  setShouldCancelBulk,
  getExistingOrdersByIds,
  bulkDeleteOrdersByShopifyId
};
