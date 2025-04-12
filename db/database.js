import mongoose from "mongoose";
import config from "../variables/index.js";

export const connectMongoDB = async () => {
  try {
    await mongoose.connect(`${config.database_url}`);
    console.log(`MongoDB connected`);
  } catch (error) {
    console.error(error.message);
  }
};

export const disconnectMongoDB = async () => {
  try {
    await mongoose.connection.close();
    console.log(`MongoDB disconnected`);
  } catch (error) {
    console.error(error.message);
  }
};

export const isConnected = () => mongoose.connection.readyState === 1;
