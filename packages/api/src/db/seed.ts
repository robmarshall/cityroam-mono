import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { messageBanks } from "./schema/message-banks.js";
import { routes } from "./schema/routes.js";
import { stops } from "./schema/stops.js";

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

  // Over-length messages
  { type: "over-length", content: "That's a bit much. Keep it shorter." },
  { type: "over-length", content: "Too long. Try again with fewer words." },
  { type: "over-length", content: "I stopped reading halfway through. Shorter, please." },

  // Opening templates
  { type: "opening", content: "Welcome. I'll be your guide today — I know where we're going, you do the leg work.\n\nHere's how it works: I'll give you a clue at each stop, you figure it out, and we move on. Ask for a hint if you're stuck. Shouldn't take more than 90 minutes if you keep moving.\n\nRight. Head to {{FIRST_STOP_DIRECTIONS}}.\n\nWhen you get there, your first clue:\n\n\"{{FIRST_CLUE}}\"" },
  { type: "opening", content: "Right then, let's get started. I'll be guiding you through {{CITY_NAME}} today.\n\nThe rules are simple: I give clues, you solve them. Ask for hints if you're stuck — no shame in it.\n\nFirst up: {{FIRST_STOP_DIRECTIONS}}.\n\nYour clue:\n\n\"{{FIRST_CLUE}}\"" },
  { type: "opening", content: "Welcome to the hunt. I'm your guide — dry wit, good directions, no patience for dawdling.\n\nI'll set the clues, you work them out. Hints are available if you get stuck. {{TOTAL_STOPS}} stops, roughly 90 minutes.\n\nTo begin: {{FIRST_STOP_DIRECTIONS}}.\n\nClue:\n\n\"{{FIRST_CLUE}}\"" },

  // Completion templates
  { type: "completion", content: "That's the last one. Well done — you've made it through all {{TOTAL_STOPS}} stops and covered roughly {{DISTANCE_KM}}km of {{CITY_NAME}}.\n\nIf you enjoyed it, a Google review goes a long way: {{REVIEW_LINK}}\n\nNow go find a drink. You've earned it." },
  { type: "completion", content: "And that's a wrap. {{TOTAL_STOPS}} stops, {{DISTANCE_KM}}km, and you didn't quit once.\n\nIf you had fun, we'd appreciate a review: {{REVIEW_LINK}}\n\nEnjoy the rest of your day." },
  { type: "completion", content: "Done. All {{TOTAL_STOPS}} stops complete.\n\nYou've covered about {{DISTANCE_KM}}km of {{CITY_NAME}} and hopefully learned a thing or two.\n\nLeave a review if you're feeling generous: {{REVIEW_LINK}}" },
] as const;

const devRouteData = {
  city: "Leeds",
  name: "Leeds City Centre Discovery",
  description: "A short development route through the heart of Leeds for testing the treasure hunt experience.",
  total_stops: 3,
  estimated_duration_mins: 30,
  estimated_distance_km: "1.5",
  is_active: true,
};

const devStopsData = [
  {
    stop_number: 1,
    name: "Leeds Town Hall",
    directions_from_previous: "Head to The Headrow in the city centre. You'll see a grand building with tall columns — you can't miss it.",
    clue: "I stand with columns tall and proud, where justice once was served aloud. Victoria laid my cornerstone — now concerts fill my halls of stone.",
    accepted_answers: ["Leeds Town Hall", "Town Hall", "the Town Hall"],
    hints: ["Think civic buildings — this one has Corinthian columns.", "It's on The Headrow, opened in 1858 by Queen Victoria."],
    fun_fact: "Leeds Town Hall was designed by Cuthbert Brodrick and opened in 1858. The organ inside has over 6,500 pipes.",
    images: [],
    google_maps_link: "https://maps.google.com/?q=Leeds+Town+Hall",
  },
  {
    stop_number: 2,
    name: "Corn Exchange",
    directions_from_previous: "Walk south down Vicar Lane, past the markets. After about 5 minutes you'll see a distinctive domed roof on your right.",
    clue: "My roof is round, my trades have changed — from grain to vintage, rearranged. Step inside my oval hall, where independent traders fill each stall.",
    accepted_answers: ["Corn Exchange", "Leeds Corn Exchange", "the Corn Exchange"],
    hints: ["This building was originally for trading grain.", "It has a distinctive oval shape and domed glass roof, built in 1863."],
    fun_fact: "The Corn Exchange is another Cuthbert Brodrick design. Its elliptical shape was revolutionary for 1863 and it's now Grade I listed.",
    images: [],
    google_maps_link: "https://maps.google.com/?q=Leeds+Corn+Exchange",
  },
  {
    stop_number: 3,
    name: "Leeds Minster",
    directions_from_previous: "Head east along Kirkgate for about 3 minutes. Look for the church on your left.",
    clue: "The oldest site of worship here, I've watched this city grow each year. My name was raised from parish church — now 'Minster' puts me a notch above the rest.",
    accepted_answers: ["Leeds Minster", "the Minster", "Leeds Parish Church"],
    hints: ["It's the oldest religious site in Leeds, on Kirkgate.", "It became a Minster in 2012 — before that it was Leeds Parish Church."],
    fun_fact: "Leeds Minster stands on a site of Christian worship dating back to the 7th century. The current building is mostly Victorian but the site is over 1,300 years old.",
    images: [],
    google_maps_link: "https://maps.google.com/?q=Leeds+Minster",
  },
];

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

  console.log("Seeding development route...");
  const [route] = await db.insert(routes).values(devRouteData).returning({ id: routes.id });

  console.log(`Inserted route: ${route.id}`);

  await db.insert(stops).values(
    devStopsData.map((stop) => ({
      ...stop,
      route_id: route.id,
    }))
  );
  console.log(`Inserted ${devStopsData.length} stops.`);

  console.log("Seeding complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
