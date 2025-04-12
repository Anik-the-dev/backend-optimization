import axios from "axios";
import readline from "readline";

// this is the `type` of the downloadShopifyJsonLFile
export const downloadFileType = {
  productUpload: "PRODUCT_UPLOAD",
  productTrack: "PRODUCT_TRACK",
  giftCardUpload: "GIFT_CARD_UPLOAD",
  orderRetrieve: "ORDER_RETRIEVE"
};

export async function jsonlFileHandler(url, type) {
  if (!type) {
    console.log("Please provide a type of the jsonl File *TYPE* to download");
    return null;
  }
  try {
    const jsonObjects = [];
    const myInsertedItems = [];
    const insertionFailedItems = [];

    // Send a GET request to the URL
    const response = await axios.get(url, {
      responseType: "stream", // Ensures the content is received as binary data
      maxRedirects: 5 // Handle redirects
    });

    const rl = readline.createInterface({
      input: response.data, // Use the HTTP stream as input
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          jsonObjects.push(JSON.parse(line));
        } catch (error) {
          console.error("Invalid JSON line:", error.message);
          console.error("Invalid JSON line:", line);
        }
      }
    }
    if (type === downloadFileType.productUpload) {
      jsonObjects.forEach(elem => {
        const tempDataPrd = elem?.data?.productSet?.product;
        if (tempDataPrd && Object.entries(tempDataPrd).length > 0) {
          // inserting the uploaded product in shopify to update the shopify id and variants id in our db
          myInsertedItems.push(tempDataPrd);
        } else {
          // store the failed products
          insertionFailedItems.push(elem.data);
        }
      });
    } else if (type === downloadFileType.productTrack) {
      jsonObjects.forEach(elem => {
        const tempDataPrd = elem?.data?.productVariantsBulkUpdate?.product;
        if (tempDataPrd && Object.entries(tempDataPrd).length > 0) {
          // console.log("inserting " + index);
          // inserting the uploaded product in shopify to update the shopify id and variants id in our db
          myInsertedItems.push({
            product: elem.data.productVariantsBulkUpdate.product,
            productVariants: elem.data.productVariantsBulkUpdate.productVariants
          });
        } else {
          // store the failed products
          insertionFailedItems.push(elem.data);
        }
      });
    } else if (type === downloadFileType.giftCardUpload) {
      jsonObjects.forEach(elem => {
        const giftCard = elem?.data?.giftCardCreate?.giftCard;
        const giftCardCode = elem?.data?.giftCardCreate?.giftCardCode;
        const userErrors = elem?.data?.giftCardCreate?.userErrors;
        if (giftCard && giftCard.id) {
          myInsertedItems.push({ ...giftCard, code: giftCardCode, userErrors });
        } else {
          insertionFailedItems.push(elem.data);
        }
      });
    } else if (type === downloadFileType.orderRetrieve) {
      jsonObjects.forEach(elem => {
        myInsertedItems.push(elem);
      });
    } else {
      console.error("Invalid type of the jsonl File *TYPE* to download");
    }
    return {
      insertedItems: myInsertedItems,
      insertionFailedItems: insertionFailedItems
    };
  } catch (error) {
    if (error.response) {
      console.error(
        `HTTP error occurred: ${error.response.status} ${error.response.statusText}`
      );
    } else {
      console.error(`An error occurred: ${error.message}`);
    }
    return null; // Return null if any exception occurs
  }
}
