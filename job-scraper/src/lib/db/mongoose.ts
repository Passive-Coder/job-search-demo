import mongoose from "mongoose";

declare global {
  var __mongoose: Promise<typeof mongoose> | undefined;
}

const MONGODB_URI =
  process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/job-scraper";

mongoose.set("strictQuery", true);

async function openConnection() {
  return mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 20,
  });
}

export async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!global.__mongoose) {
    global.__mongoose = openConnection().catch(async (error) => {
      global.__mongoose = undefined;

      if (
        error instanceof Error &&
        /ECONNREFUSED|connect ECONNREFUSED|MongoServerSelectionError/i.test(error.message)
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        global.__mongoose = openConnection().catch((retryError) => {
          global.__mongoose = undefined;
          throw retryError;
        });

        return global.__mongoose;
      }

      throw error;
    });
  }

  return global.__mongoose;
}
