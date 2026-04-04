import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import postgres from "postgres";
import { messageBanks } from "./schema/message-banks.js";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "@cityroam/shared/constants";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://cityroam:cityroam@postgres:5432/cityroam";

// ---------------------------------------------------------------------------
// Translations organised by language → type → content[]
// Template variables ({{ANSWER}}, {{TOTAL_STOPS}}, etc.) are preserved as-is.
// Tone matches the English originals: casual, slightly cheeky, guide-like.
// ---------------------------------------------------------------------------

type MessageBankSeedEntry = { type: string; content: string };

const translations: Record<
  Exclude<SupportedLanguage, "en">,
  MessageBankSeedEntry[]
> = {
  // -------------------------------------------------------------------------
  // SPANISH
  // -------------------------------------------------------------------------
  es: [
    // Success
    { type: "success", content: "¡Esa es!" },
    { type: "success", content: "Correcto. Me habría preocupado si hubieras tardado más." },
    { type: "success", content: "Lo tienes." },
    { type: "success", content: "A la primera." },
    { type: "success", content: "Ahí está." },
    { type: "success", content: "Sí, esa es." },
    { type: "success", content: "De lleno." },

    // Failure
    { type: "failure", content: "No del todo." },
    { type: "failure", content: "No." },
    { type: "failure", content: "Esa no es." },
    { type: "failure", content: "No es la que busco." },
    { type: "failure", content: "Cerca, pero no." },
    { type: "failure", content: "Echa otro vistazo." },
    { type: "failure", content: "Mal. Pero confío en ti." },

    // Hint-exhausted
    { type: "hint-exhausted", content: "Eso es todo lo que tengo. La respuesta es {{ANSWER}}. Sigamos." },
    { type: "hint-exhausted", content: "Te he dado todas las pistas que tengo. Es {{ANSWER}}. Sigamos adelante." },
    { type: "hint-exhausted", content: "Vale, te saco de dudas. Es {{ANSWER}}." },

    // Clarification
    { type: "clarification", content: "No te he pillado — ¿puedes decirlo de otra forma?" },
    { type: "clarification", content: "No estoy seguro de lo que quieres decir. ¿Lo intentas otra vez?" },
    { type: "clarification", content: "Dilo de otra manera y te echo una mano." },

    // Unknown-answer
    { type: "unknown-answer", content: "Ni idea — eso queda fuera de mi conocimiento." },
    { type: "unknown-answer", content: "No tengo esa respuesta, me temo." },
    { type: "unknown-answer", content: "Ahí no puedo ayudarte." },

    // Hint-offer
    { type: "hint-offer", content: "¿Quieres una pista?" },
    { type: "hint-offer", content: "Parece que te vendría bien una pista — ¿te doy una?" },
    { type: "hint-offer", content: "¿Necesitas una pista? Solo di que sí." },
    { type: "hint-offer", content: "¿Quieres que te dé una pista?" },

    // Hint-decline
    { type: "hint-decline", content: "Sin problema — sigue intentándolo." },
    { type: "hint-decline", content: "Vale. Tómate tu tiempo." },
    { type: "hint-decline", content: "De acuerdo, tú puedes." },
    { type: "hint-decline", content: "Entendido. La oferta sigue en pie." },

    // Over-length
    { type: "over-length", content: "Es demasiado largo. Sé más breve." },
    { type: "over-length", content: "Demasiado largo. Inténtalo con menos palabras." },
    { type: "over-length", content: "Dejé de leer a la mitad. Más corto, por favor." },

    // Completion
    { type: "completion", content: "Esa fue la última. Bien hecho — has completado las {{TOTAL_STOPS}} paradas y recorrido unos {{DISTANCE_KM}}km de {{CITY_NAME}}.\n\nSi te ha gustado, una reseña en Google ayuda mucho: {{REVIEW_LINK}}\n\nAhora ve a buscarte algo de beber. Te lo has ganado." },
    { type: "completion", content: "Y eso es todo. {{TOTAL_STOPS}} paradas, {{DISTANCE_KM}}km, y no te rendiste ni una vez.\n\nSi te has divertido, agradeceríamos una reseña: {{REVIEW_LINK}}\n\nDisfruta el resto del día." },
    { type: "completion", content: "Hecho. Las {{TOTAL_STOPS}} paradas completadas.\n\nHas recorrido unos {{DISTANCE_KM}}km de {{CITY_NAME}} y esperamos que hayas aprendido algo nuevo.\n\nDéjanos una reseña si te apetece: {{REVIEW_LINK}}" },
  ],

  // -------------------------------------------------------------------------
  // FRENCH
  // -------------------------------------------------------------------------
  fr: [
    // Success
    { type: "success", content: "C'est ça !" },
    { type: "success", content: "Correct. J'aurais eu peur si ça avait pris plus longtemps." },
    { type: "success", content: "Trouvé." },
    { type: "success", content: "Du premier coup." },
    { type: "success", content: "Et voilà." },
    { type: "success", content: "Oui, c'est ça." },
    { type: "success", content: "En plein dans le mille." },

    // Failure
    { type: "failure", content: "Pas tout à fait." },
    { type: "failure", content: "Non." },
    { type: "failure", content: "Ce n'est pas ça." },
    { type: "failure", content: "Ce n'est pas ce que je cherche." },
    { type: "failure", content: "Presque, mais non." },
    { type: "failure", content: "Regarde encore." },
    { type: "failure", content: "Raté. Mais je crois en toi." },

    // Hint-exhausted
    { type: "hint-exhausted", content: "C'est tout ce que j'ai. La réponse est {{ANSWER}}. On continue." },
    { type: "hint-exhausted", content: "Je t'ai donné tous mes indices. C'est {{ANSWER}}. On avance." },
    { type: "hint-exhausted", content: "Bon, je te mets fin au suspense. C'est {{ANSWER}}." },

    // Clarification
    { type: "clarification", content: "Je n'ai pas bien compris — tu peux reformuler ?" },
    { type: "clarification", content: "Pas sûr de comprendre. On réessaie ?" },
    { type: "clarification", content: "Dis-le autrement et je verrai ce que je peux faire." },

    // Unknown-answer
    { type: "unknown-answer", content: "Aucune idée — c'est hors de mes connaissances." },
    { type: "unknown-answer", content: "Je n'ai pas cette réponse, désolé." },
    { type: "unknown-answer", content: "Là, je ne peux pas t'aider." },

    // Hint-offer
    { type: "hint-offer", content: "Tu veux un indice ?" },
    { type: "hint-offer", content: "On dirait que tu aurais besoin d'un indice — je t'en donne un ?" },
    { type: "hint-offer", content: "Besoin d'un indice ? Dis oui." },
    { type: "hint-offer", content: "Tu veux que je te donne un indice ?" },

    // Hint-decline
    { type: "hint-decline", content: "Pas de souci — continue." },
    { type: "hint-decline", content: "D'accord. Prends ton temps." },
    { type: "hint-decline", content: "Très bien, tu peux y arriver." },
    { type: "hint-decline", content: "Compris. L'offre tient toujours." },

    // Over-length
    { type: "over-length", content: "C'est un peu long. Fais plus court." },
    { type: "over-length", content: "Trop long. Réessaie avec moins de mots." },
    { type: "over-length", content: "J'ai arrêté de lire à mi-chemin. Plus court, s'il te plaît." },

    // Completion
    { type: "completion", content: "C'était la dernière. Bravo — tu as fait les {{TOTAL_STOPS}} étapes et parcouru environ {{DISTANCE_KM}}km dans {{CITY_NAME}}.\n\nSi tu as aimé, un avis Google nous aide beaucoup : {{REVIEW_LINK}}\n\nMaintenant va te trouver un verre. Tu l'as mérité." },
    { type: "completion", content: "Et voilà, c'est fini. {{TOTAL_STOPS}} étapes, {{DISTANCE_KM}}km, et tu n'as pas abandonné une seule fois.\n\nSi tu t'es bien amusé, on apprécierait un avis : {{REVIEW_LINK}}\n\nProfite du reste de ta journée." },
    { type: "completion", content: "Terminé. Les {{TOTAL_STOPS}} étapes sont complètes.\n\nTu as parcouru environ {{DISTANCE_KM}}km dans {{CITY_NAME}} et tu as sûrement appris une chose ou deux.\n\nLaisse un avis si le cœur t'en dit : {{REVIEW_LINK}}" },
  ],

  // -------------------------------------------------------------------------
  // GERMAN
  // -------------------------------------------------------------------------
  de: [
    // Success
    { type: "success", content: "Das ist es!" },
    { type: "success", content: "Richtig. Hätte mich gewundert, wenn du länger gebraucht hättest." },
    { type: "success", content: "Getroffen." },
    { type: "success", content: "Beim ersten Versuch." },
    { type: "success", content: "Da ist es." },
    { type: "success", content: "Ja, das stimmt." },
    { type: "success", content: "Volltreffer." },

    // Failure
    { type: "failure", content: "Nicht ganz." },
    { type: "failure", content: "Nein." },
    { type: "failure", content: "Das ist es nicht." },
    { type: "failure", content: "Nicht das, was ich suche." },
    { type: "failure", content: "Nah dran, aber nein." },
    { type: "failure", content: "Schau nochmal." },
    { type: "failure", content: "Falsch. Aber ich glaub an dich." },

    // Hint-exhausted
    { type: "hint-exhausted", content: "Das war alles. Die Antwort ist {{ANSWER}}. Weiter geht's." },
    { type: "hint-exhausted", content: "Ich hab dir alle Hinweise gegeben. Es ist {{ANSWER}}. Machen wir weiter." },
    { type: "hint-exhausted", content: "Gut, ich erlöse dich. Es ist {{ANSWER}}." },

    // Clarification
    { type: "clarification", content: "Das hab ich nicht verstanden — kannst du es anders sagen?" },
    { type: "clarification", content: "Nicht sicher, was du meinst. Nochmal versuchen?" },
    { type: "clarification", content: "Sag es anders und ich versuch dir zu helfen." },

    // Unknown-answer
    { type: "unknown-answer", content: "Keine Ahnung — das liegt außerhalb meines Wissens." },
    { type: "unknown-answer", content: "Die Antwort hab ich leider nicht." },
    { type: "unknown-answer", content: "Da kann ich dir nicht weiterhelfen." },

    // Hint-offer
    { type: "hint-offer", content: "Möchtest du einen Hinweis?" },
    { type: "hint-offer", content: "Klingt so, als könntest du einen Hinweis gebrauchen — soll ich?" },
    { type: "hint-offer", content: "Brauchst du einen Hinweis? Sag einfach ja." },
    { type: "hint-offer", content: "Soll ich dir einen Hinweis geben?" },

    // Hint-decline
    { type: "hint-decline", content: "Kein Problem — mach weiter." },
    { type: "hint-decline", content: "Alles gut. Lass dir Zeit." },
    { type: "hint-decline", content: "In Ordnung, du schaffst das." },
    { type: "hint-decline", content: "Verstanden. Das Angebot steht weiterhin." },

    // Over-length
    { type: "over-length", content: "Das ist etwas viel. Fass dich kürzer." },
    { type: "over-length", content: "Zu lang. Versuch es mit weniger Wörtern." },
    { type: "over-length", content: "Ich hab mittendrin aufgehört zu lesen. Kürzer, bitte." },

    // Completion
    { type: "completion", content: "Das war die letzte. Gut gemacht — du hast alle {{TOTAL_STOPS}} Stationen geschafft und etwa {{DISTANCE_KM}}km durch {{CITY_NAME}} zurückgelegt.\n\nWenn es dir gefallen hat, hilft uns eine Google-Bewertung sehr: {{REVIEW_LINK}}\n\nJetzt gönn dir was zu trinken. Du hast es dir verdient." },
    { type: "completion", content: "Und das war's. {{TOTAL_STOPS}} Stationen, {{DISTANCE_KM}}km, und du hast nicht einmal aufgegeben.\n\nWenn es Spaß gemacht hat, würden wir uns über eine Bewertung freuen: {{REVIEW_LINK}}\n\nGenieß den Rest des Tages." },
    { type: "completion", content: "Fertig. Alle {{TOTAL_STOPS}} Stationen geschafft.\n\nDu hast etwa {{DISTANCE_KM}}km durch {{CITY_NAME}} zurückgelegt und hoffentlich einiges gelernt.\n\nHinterlass eine Bewertung, wenn du magst: {{REVIEW_LINK}}" },
  ],

  // -------------------------------------------------------------------------
  // DUTCH
  // -------------------------------------------------------------------------
  nl: [
    // Success
    { type: "success", content: "Dat is 'm!" },
    { type: "success", content: "Correct. Ik had me zorgen gemaakt als het langer had geduurd." },
    { type: "success", content: "Gevonden." },
    { type: "success", content: "In één keer goed." },
    { type: "success", content: "Daar is het." },
    { type: "success", content: "Ja, dat klopt." },
    { type: "success", content: "Raak." },

    // Failure
    { type: "failure", content: "Niet helemaal." },
    { type: "failure", content: "Nee." },
    { type: "failure", content: "Dat is het niet." },
    { type: "failure", content: "Niet wat ik zoek." },
    { type: "failure", content: "Dichtbij, maar nee." },
    { type: "failure", content: "Kijk nog eens." },
    { type: "failure", content: "Fout. Maar ik geloof in je." },

    // Hint-exhausted
    { type: "hint-exhausted", content: "Dat was alles. Het antwoord is {{ANSWER}}. We gaan verder." },
    { type: "hint-exhausted", content: "Ik heb je alle aanwijzingen gegeven. Het is {{ANSWER}}. Door naar de volgende." },
    { type: "hint-exhausted", content: "Oké, ik verlos je. Het is {{ANSWER}}." },

    // Clarification
    { type: "clarification", content: "Ik begreep je niet helemaal — kun je het anders zeggen?" },
    { type: "clarification", content: "Niet zeker wat je bedoelt. Nog een keer proberen?" },
    { type: "clarification", content: "Zeg het op een andere manier en ik probeer je te helpen." },

    // Unknown-answer
    { type: "unknown-answer", content: "Geen idee — dat valt buiten mijn kennis." },
    { type: "unknown-answer", content: "Dat antwoord heb ik niet, ben ik bang." },
    { type: "unknown-answer", content: "Daar kan ik je niet mee helpen." },

    // Hint-offer
    { type: "hint-offer", content: "Wil je een hint?" },
    { type: "hint-offer", content: "Het klinkt alsof je een hint kunt gebruiken — zal ik er een geven?" },
    { type: "hint-offer", content: "Een hint nodig? Zeg maar ja." },
    { type: "hint-offer", content: "Wil je dat ik je een hint geef?" },

    // Hint-decline
    { type: "hint-decline", content: "Geen probleem — ga zo door." },
    { type: "hint-decline", content: "Prima. Neem je tijd." },
    { type: "hint-decline", content: "Oké, je kunt het." },
    { type: "hint-decline", content: "Begrepen. Het aanbod blijft staan." },

    // Over-length
    { type: "over-length", content: "Dat is wat veel. Houd het korter." },
    { type: "over-length", content: "Te lang. Probeer het met minder woorden." },
    { type: "over-length", content: "Ik stopte halverwege met lezen. Korter, alsjeblieft." },

    // Completion
    { type: "completion", content: "Dat was de laatste. Goed gedaan — je hebt alle {{TOTAL_STOPS}} stops gehaald en ongeveer {{DISTANCE_KM}}km door {{CITY_NAME}} afgelegd.\n\nAls je het leuk vond, helpt een Google-review enorm: {{REVIEW_LINK}}\n\nGa nu iets te drinken halen. Je hebt het verdiend." },
    { type: "completion", content: "En dat was het. {{TOTAL_STOPS}} stops, {{DISTANCE_KM}}km, en je hebt niet één keer opgegeven.\n\nAls je het leuk vond, zouden we een review waarderen: {{REVIEW_LINK}}\n\nGeniet van de rest van je dag." },
    { type: "completion", content: "Klaar. Alle {{TOTAL_STOPS}} stops voltooid.\n\nJe hebt ongeveer {{DISTANCE_KM}}km door {{CITY_NAME}} afgelegd en hopelijk iets nieuws geleerd.\n\nLaat een review achter als je daar zin in hebt: {{REVIEW_LINK}}" },
  ],
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage: seed-message-banks <language|all> [--dry-run] [--clear]

Arguments:
  language   A supported language code: ${SUPPORTED_LANGUAGES.filter((l) => l !== "en").join(", ")}
  all        Seed all non-English languages

Options:
  --dry-run  Print what would be inserted without touching the database
  --clear    Delete existing message bank entries for the target language(s) before inserting
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const clear = args.includes("--clear");
  const langArg = args.find((a) => !a.startsWith("--"));

  if (!langArg) {
    printUsage();
    process.exit(1);
  }

  // Determine which languages to seed
  const targetLanguages: Exclude<SupportedLanguage, "en">[] =
    langArg === "all"
      ? (SUPPORTED_LANGUAGES.filter((l) => l !== "en") as Exclude<SupportedLanguage, "en">[])
      : [langArg as Exclude<SupportedLanguage, "en">];

  // Validate
  for (const lang of targetLanguages) {
    if (!translations[lang]) {
      console.error(
        `Error: No translations for "${lang}". Available: ${Object.keys(translations).join(", ")}, all`
      );
      process.exit(1);
    }
  }

  if (dryRun) {
    for (const lang of targetLanguages) {
      const entries = translations[lang];
      console.log(`\n[DRY RUN] ${LANGUAGE_NAMES[lang]} (${lang}): ${entries.length} entries`);
      const byType = new Map<string, number>();
      for (const e of entries) {
        byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      }
      for (const [type, count] of byType) {
        console.log(`  ${type}: ${count}`);
      }
    }
    return;
  }

  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  try {
    for (const lang of targetLanguages) {
      const entries = translations[lang];

      if (clear) {
        console.log(`Clearing existing ${lang} message bank entries...`);
        await db
          .delete(messageBanks)
          .where(eq(messageBanks.language, lang));
      }

      // Check for existing entries to avoid duplicates
      const existing = await db
        .select({ id: messageBanks.id })
        .from(messageBanks)
        .where(eq(messageBanks.language, lang));

      if (existing.length > 0 && !clear) {
        console.log(
          `Warning: ${existing.length} ${lang} entries already exist. Use --clear to replace them, or they will be added alongside existing ones.`
        );
        console.log("Skipping. Use --clear to overwrite.");
        continue;
      }

      console.log(
        `Seeding ${entries.length} message bank entries for ${LANGUAGE_NAMES[lang]} (${lang})...`
      );
      await db.insert(messageBanks).values(
        entries.map((e) => ({
          type: e.type,
          language: lang,
          content: e.content,
        }))
      );
      console.log(`Inserted ${entries.length} entries for ${lang}.`);
    }

    console.log("Done.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
