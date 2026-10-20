import { MongoClient, type Db } from "mongodb";

/**
 * Thin wrapper around the official driver. No ODM, no collections created here:
 * application-owned collections and indexes arrive in Phase 6 (BACKEND_SCHEMA.md).
 */
export interface Mongo {
  connect(): Promise<void>;
  close(): Promise<void>;
  /** Resolves when the server answers a ping; rejects otherwise. */
  ping(): Promise<void>;
  db(): Db;
}

export function createMongo(uri: string, dbName: string): Mongo {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    appName: "communication-system-api",
  });
  return {
    connect: async () => {
      await client.connect();
    },
    close: () => client.close(),
    ping: async () => {
      await client.db(dbName).command({ ping: 1 });
    },
    db: () => client.db(dbName),
  };
}
