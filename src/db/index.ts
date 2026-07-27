import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
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

const sql = neon(connectionString);

// Drizzle supports both HTTP and WebSocket clients. Choose the one that fits your needs:

// HTTP Client:
// - Best for serverless functions and Lambda environments
// - Ideal for stateless operations and quick queries
// - Lower overhead for single queries
// - Better for applications with sporadic database access
export const db = drizzleHttp({ client: sql, schema });
