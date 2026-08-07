import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

let connectionString = process.env.DATABASE_URL
  ? process.env.DATABASE_URL
  : (() => {
      throw new Error(
        "DATABASE_URL is not defined in the environment variables.",
      );
    })();

// Configuring Neon for local development
if (process.env.NODE_ENV === "development") {
  connectionString = "postgres://postgres:postgres@db.localtest.me:5432/main";
  neonConfig.fetchEndpoint = (host) => {
    const [protocol, port] =
      host === "db.localtest.me" ? ["http", 4444] : ["https", 443];
    return `${protocol}://${host}:${port}/sql`;
  };
  const connectionStringUrl = new URL(connectionString);
  neonConfig.useSecureWebSocket =
    connectionStringUrl.hostname !== "db.localtest.me";
  neonConfig.wsProxy = (host) =>
    host === "db.localtest.me" ? `${host}:4444/v2` : `${host}/v2`;
}
neonConfig.webSocketConstructor = ws;

// Roster replacement and owner bootstrap must be atomic. Neon's WebSocket
// pool supports interactive transactions; its HTTP driver intentionally does
// not.
const pool = new Pool({ connectionString });
export const db = drizzle({ client: pool, schema });
