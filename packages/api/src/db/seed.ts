import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { messageBanks } from "./schema/message-banks.js";
import { routeFamilies } from "./schema/route-families.js";
import { routes } from "./schema/routes.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://cityroam:cityroam@postgres:5432/cityroam";

const messageBankSeedData = [
  // Success messages
  { type: "success", content: "That's the one." },
  { type: "success", content: "Correct. I'd be worried if that had taken any longer." },
  { type: "success", content: "Got it." },
  { type: "success", content: "Right first time." },
  { type: "success", content: "There it is." },
  { type: "success", content: "Yep, that's it." },
  { type: "success", content: "Bang on." },

  // Failure messages
  { type: "failure", content: "Not quite." },
  { type: "failure", content: "Nope." },
  { type: "failure", content: "That's not it." },
  { type: "failure", content: "Not the one I'm looking for." },
  { type: "failure", content: "Close, but no." },
  { type: "failure", content: "Have another look." },
  { type: "failure", content: "Wrong. But I believe in you." },

  // Hint-exhausted messages
  { type: "hint-exhausted", content: "That's everything I've got. The answer is {{ANSWER}}. On we go." },
  { type: "hint-exhausted", content: "I've given you all the clues I have. It's {{ANSWER}}. Let's keep moving." },
  { type: "hint-exhausted", content: "Right, I'll put you out of your misery. It's {{ANSWER}}." },

  // Clarification messages
  { type: "clarification", content: "I didn't quite catch that — could you say it differently?" },
  { type: "clarification", content: "Not sure what you mean. Try again?" },
  { type: "clarification", content: "Say that another way and I'll try to help." },

  // Unknown-answer messages
  { type: "unknown-answer", content: "Not sure — that one's outside my knowledge." },
  { type: "unknown-answer", content: "I don't have that one, I'm afraid." },
  { type: "unknown-answer", content: "Can't help you there." },

  // Hint-offer messages
  { type: "hint-offer", content: "Would you like a hint?" },
  { type: "hint-offer", content: "Sounds like you could use a hint — shall I give you one?" },
  { type: "hint-offer", content: "Need a hint? Just say yes." },
  { type: "hint-offer", content: "Want me to give you a hint?" },

  // Hint-decline messages
  { type: "hint-decline", content: "No worries — keep at it." },
  { type: "hint-decline", content: "Fair enough. Take your time." },
  { type: "hint-decline", content: "Alright, you've got this." },
  { type: "hint-decline", content: "Understood. The offer stands if you change your mind." },

  // Over-length messages
  { type: "over-length", content: "That's a bit much. Keep it shorter." },
  { type: "over-length", content: "Too long. Try again with fewer words." },
  { type: "over-length", content: "I stopped reading halfway through. Shorter, please." },

  // Completion templates
  { type: "completion", content: "That's the last one. Well done — you've made it through all {{TOTAL_STOPS}} stops and covered roughly {{DISTANCE_KM}}km of {{CITY_NAME}}.\n\nIf you enjoyed it, a Google review goes a long way: {{REVIEW_LINK}}\n\nNow go find a drink. You've earned it." },
  { type: "completion", content: "And that's a wrap. {{TOTAL_STOPS}} stops, {{DISTANCE_KM}}km, and you didn't quit once.\n\nIf you had fun, we'd appreciate a review: {{REVIEW_LINK}}\n\nEnjoy the rest of your day." },
  { type: "completion", content: "Done. All {{TOTAL_STOPS}} stops complete.\n\nYou've covered about {{DISTANCE_KM}}km of {{CITY_NAME}} and hopefully learned a thing or two.\n\nLeave a review if you're feeling generous: {{REVIEW_LINK}}" },
] as const;

const devRouteFamilyData = {
  name: "Leeds City Centre Discovery",
  city: "Leeds",
};

const devRouteData = {
  name: "Leeds City Centre Discovery",
  description: "A short development route through the heart of Leeds for testing the city exploration experience.",
  language: "en",
  total_stops: 3,
  estimated_duration_mins: 30,
  estimated_distance_km: "1.5",
  is_active: true,
};


async function main() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding message banks...");
  await db.insert(messageBanks).values(
    messageBankSeedData.map((item) => ({
      type: item.type,
      content: item.content,
    }))
  );
  console.log(`Inserted ${messageBankSeedData.length} message bank entries.`);

  console.log("Seeding development route family...");
  const [family] = await db.insert(routeFamilies).values(devRouteFamilyData).returning({ id: routeFamilies.id });
  console.log(`Inserted route family: ${family.id}`);

  console.log("Seeding development route...");
  const [route] = await db.insert(routes).values({ ...devRouteData, route_family_id: family.id }).returning({ id: routes.id });
  console.log(`Inserted route: ${route.id}`);


  console.log("Seeding complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
