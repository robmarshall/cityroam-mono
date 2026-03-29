import postgres from "postgres";
import { EVENT_CODE_ALPHABET, EVENT_CODE_LENGTH } from "@cityroam/shared/constants";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://cityroam:cityroam@localhost:5432/cityroam";
const sql = postgres(DATABASE_URL);

const regex = new RegExp(`^[${EVENT_CODE_ALPHABET}]{6,${EVENT_CODE_LENGTH}}$`);

async function main() {
  const rows = await sql`SELECT id, code, status, buyer_email, created_at FROM events ORDER BY created_at DESC`;
  console.log("\nAll events:\n");
  for (const r of rows) {
    const valid = regex.test(r.code);
    console.log(`  ${r.code}  status=${r.status}  email=${r.buyer_email}  valid_code=${valid}  id=${r.id}  created=${r.created_at}`);
  }
  console.log(`\nTotal: ${rows.length} events`);
  await sql.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
