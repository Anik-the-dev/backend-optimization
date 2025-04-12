import { model, Schema, Types } from "mongoose";

const OrderSchema = new Schema(
  {
    uniqueId: {
      type: String,
      required: false,
      default: null,
      index: true
    },
    // Build your schema...............
  },
  {
    timestamps: true
  }
);

export const OrderModel = model("Order", OrderSchema, "orders");
