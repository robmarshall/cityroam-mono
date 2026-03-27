import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://cityroam:cityroam@postgres:5432/cityroam";

const client = postgres(DATABASE_URL);

export const db = drizzle(client, { schema });
export type Database = typeof db;

export { schema };
