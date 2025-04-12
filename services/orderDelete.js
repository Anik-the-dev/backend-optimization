// Shopify Order Deletion Service with Dynamic Concurrency & Throttle Management

import fs from "fs/promises";
import readline from "readline";
import path from "path";
import { createWriteStream } from "fs";
import axios from "axios";
import { connectMongoDB, disconnectMongoDB } from "../db/database.js";
import { OrderModel } from "../db/models/order.js"; 
import { OrderHelper } from "../helper/order.js";
import {
  SHOPIFY_GRAPHQL_MUTATION,
  SHOPIFY_GRAPHQL_QUERIES
} from "../helper/queries.js";
import { createShopifyClient } from "../helper/shopify.js";
import { downloadFileType } from "../helper/jsonlFileHandler.js";
import {
  retryWithBackoff,
  limitedConcurrency,
  setConcurrency,
  getAverageConcurrency,
  clearConcurrencyStats
} from "../utils/retryManager.js";
import { updateThrottleStatus, waitForPoints } from "../utils/rateManager.js";

const CONFIG = {
  MAX_RETRIES: 3,
  CHUNK_SIZE: parseInt(process.env.DB_UPLOAD_CHUNK_SIZE || "100", 10)
};

function log(...args) {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${time}]`, ...args);
}

async function jsonlFileHandler(url, type, outputPath = null) {
  if (!type) throw new Error("Missing file type");

  const response = await axios.get(url, {
    responseType: "stream",
    maxRedirects: 5
  });

  if (outputPath) {
    const writer = createWriteStream(outputPath);
    response.data.pipe(writer);
    await new Promise((res, rej) => {
      writer.on("finish", res);
      writer.on("error", rej);
    });
  }

  const inputStream = outputPath
    ? (await fs.open(outputPath)).createReadStream()
    : response.data;

  const jsonObjects = [];
  const rl = readline.createInterface({
    input: inputStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (type === downloadFileType.orderRetrieve && parsed?.id) {
        jsonObjects.push(parsed);
      }
    } catch (err) {
      console.warn("❌ Invalid JSON line", line.slice(0, 100));
    }
  }

  return { insertedItems: jsonObjects };
}

async function createBulkOperation(client) {
  const data = await client.request(
    SHOPIFY_GRAPHQL_MUTATION.CREATE_BULK_OPERATION_FOR_ORDERS
  );
  const opId = data?.data?.bulkOperationRunQuery?.bulkOperation?.id;
  if (!opId) throw new Error("Missing bulk operation ID");
  return opId;
}

async function fetchAllOrders(client, operationId) {
  let statusResponse;
  do {
    await new Promise(res => setTimeout(res, 10000));
    statusResponse = await retryWithBackoff(() =>
      client.request(SHOPIFY_GRAPHQL_QUERIES.FETCH_BULK_OPERATION, {
        variables: { operationId }
      })
    );
    log("Status:", statusResponse?.data?.node?.status);
  } while (statusResponse?.data?.node?.status === "RUNNING");

  const url = statusResponse?.data?.node?.url;
  if (!url) throw new Error("Missing result URL");
  const filePath = path.resolve("orders.jsonl");
  await jsonlFileHandler(url, downloadFileType.orderRetrieve, filePath);
  return filePath;
}

async function deleteOrdersStreamed(client, filePath) {
  const stream = readline.createInterface({
    input: (await fs.open(filePath)).createReadStream(),
    crlfDelay: Infinity
  });

  const toDelete = [];
  let totalDeleted = 0;
  let chunkIndex = 1;
  const allChunks = [];

  for await (const line of stream) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed?.id) continue;

    const exists = await OrderModel.exists({ shopifyId: parsed.id });
    if (exists) toDelete.push(parsed.id);

    if (toDelete.length >= CONFIG.CHUNK_SIZE) {
      const deletedInChunk = await processDeleteBatch(
        client,
        toDelete.splice(0),
        chunkIndex
      );
      allChunks.push({
        chunkIndex,
        deletedInChunk,
        avgConcurrency: getAverageConcurrency(chunkIndex)
      });
      totalDeleted += deletedInChunk;
      chunkIndex++;
    }
  }

  if (toDelete.length) {
    const deletedInChunk = await processDeleteBatch(
      client,
      toDelete,
      chunkIndex
    );
    allChunks.push({
      chunkIndex,
      deletedInChunk,
      avgConcurrency: getAverageConcurrency(chunkIndex)
    });
    totalDeleted += deletedInChunk;
  }

  log("================== FINAL SUMMARY ==================");
  console.table(
    allChunks.map(chunk => ({
      Chunk: chunk.chunkIndex,
      "Orders Deleted": chunk.deletedInChunk,
      "Avg Concurrency": chunk.avgConcurrency.toFixed(2)
    }))
  );

  log("🗑️ Total Orders Deleted:", totalDeleted);
  log(
    "⏱️ Total Execution Time:",
    `${((Date.now() - startTime) / 1000).toFixed(2)}s`
  );

  console.table([
    {
      Metric: "Initial Memory (MB)",
      Value: (initialMemory / 1024 / 1024).toFixed(2)
    },
    { Metric: "Peak Memory (MB)", Value: (maxMemory / 1024 / 1024).toFixed(2) },
    {
      Metric: "Avg Memory (MB)",
      Value: (memorySum / memoryChecks / 1024 / 1024).toFixed(2)
    }
  ]);

  await fs.unlink(filePath).catch(() => {});
}

async function processDeleteBatch(client, orderIds, chunkIndex = 0) {
  let deleted = 0;

  await Promise.all(
    orderIds.map(orderId =>
      limitedConcurrency(async () => {
        await waitForPoints(50);
        const res = await retryWithBackoff(() =>
          client.request(SHOPIFY_GRAPHQL_MUTATION.DELETE_ORDER, {
            variables: { orderId }
          })
        );

        const throttle = res?.extensions?.cost?.throttleStatus;
        if (throttle) {
          updateThrottleStatus(throttle);

          const maxConcurrency = Math.floor(
            (throttle.currentlyAvailable / 50) * 0.9
          );
          if (!isNaN(maxConcurrency) && maxConcurrency > 0) {
            setConcurrency(maxConcurrency);
          }
        }

        const error = res?.data?.orderDelete?.userErrors?.[0];
        if (error) {
          log(`❌ [${orderId}]`, error.message);
        } else {
          await OrderHelper.bulkDeleteOrdersByShopifyId([orderId]);
          deleted++;
        }
      }, chunkIndex)
    )
  );

  log("----------------------------");
  log(`✅ Chunk ${chunkIndex}: ${deleted} orders deleted.`);
  log(
    `⚙️ Avg Concurrency Used: ${getAverageConcurrency(chunkIndex).toFixed(2)}`
  );
  log("----------------------------");

  return deleted;
}

let initialMemory = process.memoryUsage().rss;
let maxMemory = initialMemory;
let memorySum = initialMemory;
let memoryChecks = 1;
const memoryInterval = setInterval(() => {
  const current = process.memoryUsage().rss;
  if (current > maxMemory) maxMemory = current;
  memorySum += current;
  memoryChecks++;
}, 500);

const startTime = Date.now();

const init = async storeId => {
  if (!storeId) throw new Error("Missing STORE_ID");
  try {
    await connectMongoDB();
    const client = await createShopifyClient(storeId);
    const opId = await createBulkOperation(client);
    const filePath = await fetchAllOrders(client, opId);
    await deleteOrdersStreamed(client, filePath);
  } catch (err) {
    log("💥 Error:", err?.stack || err?.message);
  } finally {
    clearConcurrencyStats();
    clearInterval(memoryInterval);
    await disconnectMongoDB();
  }
};

init(process.env.STORE_ID);
