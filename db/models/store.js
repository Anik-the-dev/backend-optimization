import { model, Schema } from "mongoose";

const locationSchema = new Schema(
  {
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    }
  },
  {
    _id: false
  }
);
const StoreSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    locations: {
      type: [locationSchema],
      required: false,
      default: []
    },
    currencyCode: {
      type: String,
      required: false,
      default: "CAD"
    },
    shopName: {
      type: String,
      required: true
      // unique: true,
    },
    xCSRFToken: {
      type: String,
      required: false
      // unique: true,
    },
    cookies: { type: [Schema.Types.Mixed], default: [] },
    // api_key,api_pass,shop_name,api_version
    apiKey: {
      type: String,
      required: true,
      select: false
    },
    apiPass: {
      type: String,
      required: true,
      select: false
    },
    createdAt: {
      type: Date,
      required: false,
      default: Date.now()
    },
    updatedAt: {
      type: Date,
      required: false,
      default: Date.now()
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true
    }
  }
);

export const StoreModel = model("Store", StoreSchema, "store");
