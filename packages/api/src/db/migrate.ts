import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { events } from "./schema/events.js";
import { participants } from "./schema/participants.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://cityroam:cityroam@postgres:5432/cityroam";

async function main() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });

  // Add deferred FK for events.lead_participant_id -> participants.id
  // This handles the circular dependency between events and participants
  console.log("Adding deferred FK for lead_participant_id...");
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'events_lead_participant_id_fk'
        AND table_name = 'events'
      ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_lead_participant_id_fk
        FOREIGN KEY (lead_participant_id)
        REFERENCES participants(id)
        DEFERRABLE INITIALLY DEFERRED;
      END IF;
    END $$;
  `);

  console.log("Migrations complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
