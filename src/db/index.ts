import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const queryClient = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : ((() => {
      throw new Error("DATABASE_URL is not set.");
    }) as unknown as ReturnType<typeof neon>);

export const db = drizzle(queryClient, { schema });
