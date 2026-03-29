import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://cityroam:cityroam@localhost:5432/cityroam";
const sql = postgres(DATABASE_URL);

async function main() {
  const routes = await sql`SELECT id FROM routes LIMIT 1`;
  if (routes.length === 0) {
    console.log("No routes found. Run seed first.");
    await sql.end();
    process.exit(1);
  }

  const routeId = routes[0].id;
  const code = "testab";

  const result = await sql`
    INSERT INTO events (route_id, code, status, buyer_email, expires_at)
    VALUES (${routeId}, ${code}, 'NOT_STARTED', 'test@example.com', NOW() + INTERVAL '7 days')
    ON CONFLICT (code) DO UPDATE SET status = 'NOT_STARTED'
    RETURNING id, code, status
  `;

  console.log("Created event:", result[0]);
  console.log(`\nOpen: http://localhost:5173/app/hunt/${code}`);
  await sql.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
