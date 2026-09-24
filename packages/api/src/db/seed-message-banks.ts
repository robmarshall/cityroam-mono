import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import postgres from "postgres";
import { messageBanks } from "./schema/message-banks.js";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "@cityroam/shared/constants";
import { pathToFileURL } from "node:url";
import { messageBankSeedData } from "./seed.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://cityroam:cityroam@postgres:5432/cityroam";

// ---------------------------------------------------------------------------
// Translations organised by language → type → content[]
// Template variables ({{ANSWER}}, {{TOTAL_STOPS}}, etc.) are preserved as-is.
// Tone matches the English originals: casual, slightly cheeky, guide-like.
// ---------------------------------------------------------------------------

type MessageBankSeedEntry = { type: string; content: string };

export const translations: Record<
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

    // Guide degraded (LLM unavailable)
    { type: "guide-degraded", content: "Ahora mismo no me funciona la cabeza. Escribe tu respuesta o pide una pista y me las apañaré." },
    { type: "guide-degraded", content: "Algo va mal por mi parte. Las respuestas y las pistas siguen funcionando; lo demás tendrá que esperar." },
    { type: "guide-degraded", content: "No estoy pensando con claridad. Aún puedes darme tu respuesta o pedir una pista." },

    // Guide busy (shared rate limit)
    { type: "guide-busy", content: "De uno en uno. Dame un momento y vuelve a preguntar." },
    { type: "guide-busy", content: "Estáis hablando todos a la vez. Pregúntame otra vez en un segundo." },
    { type: "guide-busy", content: "Demasiados a la vez. Inténtalo de nuevo en un momento." },

    // Guide identity, asked directly about AI: an honest, partial answer
    { type: "guide-identity-ai", content: "En parte. La IA me ayuda a redactar las respuestas, pero la ruta y las pistas las eligen y revisan personas." },
    { type: "guide-identity-ai", content: "En parte. La IA ayuda con la redacción, y son personas quienes eligen la ruta y revisan cada pista." },
    { type: "guide-identity-ai", content: "Sí y no. La IA me ayuda a expresarme, pero las paradas y las pistas las eligen y comprueban personas antes de que os lleguen." },

    // Guide identity, bot / robot / computer: never opens with a negation
    { type: "guide-identity-machine", content: "Soy {{GUIDE_NAME}}, el guía que lleváis en el móvil. La pista sigue esperando." },
    { type: "guide-identity-machine", content: "Soy el guía que lleváis en el móvil y respondo a lo que escribe vuestro grupo. Lo auténtico son las calles." },
    { type: "guide-identity-machine", content: "{{GUIDE_NAME}}, a vuestro servicio desde el móvil. Volvemos a la pista cuando queráis." },

    // Guide identity, real person / human: may open with "not a person, no"
    { type: "guide-identity-person", content: "Una persona no, no. Soy {{GUIDE_NAME}}, el guía que lleváis en el móvil." },
    { type: "guide-identity-person", content: "Una persona no, no. Solo el guía del móvil, para que no os salgáis de la ruta." },
    { type: "guide-identity-person", content: "No, soy el guía que lleváis en el móvil. Lo auténtico es la ciudad que tenéis alrededor." },

    // Guide identity, who are you / what's your name: never opens with a negation
    { type: "guide-identity-who", content: "Soy {{GUIDE_NAME}}, vuestro guía de hoy. Me conozco estas calles y os voy dando las pistas." },
    { type: "guide-identity-who", content: "Soy {{GUIDE_NAME}}, el guía que lleváis en el móvil. Respondo a lo que escribe vuestro grupo y os mantengo en la ruta." },
    { type: "guide-identity-who", content: "{{GUIDE_NAME}}. Vivo en vuestro móvil y me conozco esta ruta mejor que casi nadie." },

    // Early answer: the next clue answered while still walking to it
    { type: "early-answer", content: "Guardad esa respuesta: aún no habéis llegado. Os lo preguntaré como es debido al llegar." },
    { type: "early-answer", content: "Un poco pronto para eso. Guardadlo hasta que lleguéis." },
    { type: "early-answer", content: "Guardad esa para luego. La pregunta llega cuando estéis en el sitio." },
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

    // Guide degraded (LLM unavailable)
    { type: "guide-degraded", content: "Ma tête ne suit plus. Écrivez votre réponse ou demandez un indice, je m'en sortirai." },
    { type: "guide-degraded", content: "Quelque chose ne va pas de mon côté. Les réponses et les indices marchent toujours, le reste devra attendre." },
    { type: "guide-degraded", content: "Je ne réfléchis pas bien en ce moment. Vous pouvez toujours me donner votre réponse ou demander un indice." },

    // Guide busy (shared rate limit)
    { type: "guide-busy", content: "Un à la fois. Laissez-moi un instant, puis redemandez." },
    { type: "guide-busy", content: "Vous parlez tous en même temps. Redemandez-moi dans une seconde." },
    { type: "guide-busy", content: "Trop de monde à la fois. Réessayez dans un moment." },

    // Guide identity, asked directly about AI: an honest, partial answer
    { type: "guide-identity-ai", content: "En partie. L'IA m'aide à formuler mes réponses, mais le parcours et les énigmes sont choisis et vérifiés par des humains." },
    { type: "guide-identity-ai", content: "En partie. L'IA aide pour la formulation, et ce sont des humains qui choisissent le parcours et vérifient chaque énigme." },
    { type: "guide-identity-ai", content: "Oui et non. L'IA m'aide à tourner mes phrases, mais des humains choisissent les étapes et vérifient les énigmes avant qu'elles vous arrivent." },

    // Guide identity, bot / robot / computer: never opens with a negation
    { type: "guide-identity-machine", content: "Je suis {{GUIDE_NAME}}, le guide dans votre téléphone. L'énigme vous attend toujours." },
    { type: "guide-identity-machine", content: "Je suis le guide dans votre téléphone, et je réponds à ce que votre groupe écrit. Le vrai, ce sont les rues." },
    { type: "guide-identity-machine", content: "{{GUIDE_NAME}}, à votre service depuis votre téléphone. On reprend l'énigme quand vous voulez." },

    // Guide identity, real person / human: may open with "not a person, no"
    { type: "guide-identity-person", content: "Pas une personne, non. Je suis {{GUIDE_NAME}}, le guide dans votre téléphone." },
    { type: "guide-identity-person", content: "Pas une personne, non. Juste le guide dans votre téléphone, pour vous garder sur le parcours." },
    { type: "guide-identity-person", content: "Non, je suis le guide dans votre téléphone. Le vrai, c'est la ville autour de vous." },

    // Guide identity, who are you / what's your name: never opens with a negation
    { type: "guide-identity-who", content: "Je suis {{GUIDE_NAME}}, votre guide du jour. Je connais ces rues et je vous donne les énigmes." },
    { type: "guide-identity-who", content: "Je suis {{GUIDE_NAME}}, le guide dans votre téléphone. Je réponds à ce que votre groupe écrit et je vous garde sur le parcours." },
    { type: "guide-identity-who", content: "{{GUIDE_NAME}}. J'habite dans votre téléphone et je connais ce parcours mieux que personne." },

    // Early answer: the next clue answered while still walking to it
    { type: "early-answer", content: "Gardez cette réponse — vous n'y êtes pas encore. Je vous poserai la question à votre arrivée." },
    { type: "early-answer", content: "Un peu tôt pour ça. Gardez-le pour quand vous serez arrivés." },
    { type: "early-answer", content: "Gardez celle-là pour plus tard. La question viendra quand vous serez au bon endroit." },
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

    // Guide degraded (LLM unavailable)
    { type: "guide-degraded", content: "Mein Kopf macht gerade nicht mit. Tipp deine Antwort oder frag nach einem Hinweis, das kriege ich noch hin." },
    { type: "guide-degraded", content: "Bei mir läuft etwas schief. Antworten und Hinweise gehen weiterhin, der Rest muss warten." },
    { type: "guide-degraded", content: "Ich denke gerade nicht klar. Du kannst mir trotzdem deine Antwort geben oder nach einem Hinweis fragen." },

    // Guide busy (shared rate limit)
    { type: "guide-busy", content: "Einer nach dem anderen. Gib mir einen Moment und frag noch mal." },
    { type: "guide-busy", content: "Ihr redet alle gleichzeitig. Frag mich gleich noch einmal." },
    { type: "guide-busy", content: "Zu viele auf einmal. Versuch es in einem Moment noch mal." },

    // Guide identity, asked directly about AI: an honest, partial answer
    { type: "guide-identity-ai", content: "Zum Teil. KI hilft mir beim Formulieren der Antworten, aber Route und Rätsel wählen und prüfen Menschen." },
    { type: "guide-identity-ai", content: "Teilweise. KI hilft bei der Formulierung, und Menschen suchen die Route aus und prüfen jedes Rätsel." },
    { type: "guide-identity-ai", content: "Ja und nein. KI hilft mir beim Formulieren, aber die Stationen und Rätsel wählen und prüfen Menschen, bevor sie bei euch ankommen." },

    // Guide identity, bot / robot / computer: never opens with a negation
    { type: "guide-identity-machine", content: "Ich bin {{GUIDE_NAME}}, eure Begleiterin im Handy. Das Rätsel wartet noch." },
    { type: "guide-identity-machine", content: "Ich bin die Begleiterin in euren Handys und antworte auf das, was eure Gruppe schreibt. Das Echte daran sind die Straßen." },
    { type: "guide-identity-machine", content: "{{GUIDE_NAME}}, zu Diensten aus eurem Handy. Zurück zum Rätsel, wenn ihr so weit seid." },

    // Guide identity, real person / human: may open with "not a person, no"
    { type: "guide-identity-person", content: "Kein Mensch, nein. Ich bin {{GUIDE_NAME}}, eure Begleiterin im Handy." },
    { type: "guide-identity-person", content: "Kein Mensch, nein. Nur die Begleiterin in euren Handys, die euch auf der Route hält." },
    { type: "guide-identity-person", content: "Nein, ich bin die Begleiterin in euren Handys. Echt ist die Stadt um euch herum." },

    // Guide identity, who are you / what's your name: never opens with a negation
    { type: "guide-identity-who", content: "Ich bin {{GUIDE_NAME}}, eure Begleiterin für heute. Ich kenne diese Straßen und liefere die Rätsel." },
    { type: "guide-identity-who", content: "Ich bin {{GUIDE_NAME}}, eure Begleiterin im Handy. Ich antworte auf das, was eure Gruppe schreibt, und halte euch auf der Route." },
    { type: "guide-identity-who", content: "{{GUIDE_NAME}}. Ich wohne in euren Handys und kenne diese Route besser als die meisten." },

    // Early answer: the next clue answered while still walking to it
    { type: "early-answer", content: "Merkt euch das — ihr seid noch nicht da. Ich frage euch richtig, wenn ihr ankommt." },
    { type: "early-answer", content: "Etwas früh dafür. Behaltet das, bis ihr da seid." },
    { type: "early-answer", content: "Hebt euch das für später auf. Die Frage kommt, wenn ihr an der richtigen Stelle steht." },
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

    // Guide degraded (LLM unavailable)
    { type: "guide-degraded", content: "Mijn hoofd doet het even niet. Typ je antwoord of vraag om een hint, dat lukt me nog." },
    { type: "guide-degraded", content: "Er gaat iets mis aan mijn kant. Antwoorden en hints werken nog, de rest moet wachten." },
    { type: "guide-degraded", content: "Ik denk even niet helder. Je kunt me nog steeds je antwoord geven of om een hint vragen." },

    // Guide busy (shared rate limit)
    { type: "guide-busy", content: "Een tegelijk. Geef me even, vraag het dan opnieuw." },
    { type: "guide-busy", content: "Jullie praten allemaal tegelijk. Vraag het zo nog eens." },
    { type: "guide-busy", content: "Te veel tegelijk. Probeer het zo nog eens." },

    // Guide identity, asked directly about AI: an honest, partial answer
    { type: "guide-identity-ai", content: "Deels. AI helpt me mijn antwoorden te formuleren, maar de route en de raadsels worden door mensen gekozen en gecontroleerd." },
    { type: "guide-identity-ai", content: "Voor een deel. AI helpt met de formulering, en mensen kiezen de route en controleren elk raadsel." },
    { type: "guide-identity-ai", content: "Ja en nee. AI helpt me met formuleren, maar mensen kiezen de stops en controleren de raadsels voordat jullie ze krijgen." },

    // Guide identity, bot / robot / computer: never opens with a negation
    { type: "guide-identity-machine", content: "Ik ben {{GUIDE_NAME}}, de gids in je telefoon. Het raadsel wacht nog." },
    { type: "guide-identity-machine", content: "Ik ben de gids in je telefoon en reageer op wat jullie groep typt. De straten zijn het echte werk." },
    { type: "guide-identity-machine", content: "{{GUIDE_NAME}}, tot jullie dienst vanuit je telefoon. We gaan verder met het raadsel als jullie er klaar voor zijn." },

    // Guide identity, real person / human: may open with "not a person, no"
    { type: "guide-identity-person", content: "Geen mens, nee. Ik ben {{GUIDE_NAME}}, de gids in je telefoon." },
    { type: "guide-identity-person", content: "Geen mens, nee. Gewoon de gids in je telefoon, die jullie op de route houdt." },
    { type: "guide-identity-person", content: "Nee, ik ben de gids in je telefoon. De stad om jullie heen is het echte werk." },

    // Guide identity, who are you / what's your name: never opens with a negation
    { type: "guide-identity-who", content: "Ik ben {{GUIDE_NAME}}, jullie gids voor vandaag. Ik ken deze straten en geef jullie de raadsels." },
    { type: "guide-identity-who", content: "Ik ben {{GUIDE_NAME}}, de gids in je telefoon. Ik reageer op wat jullie groep typt en houd jullie op de route." },
    { type: "guide-identity-who", content: "{{GUIDE_NAME}}. Ik woon in je telefoon en ken deze route beter dan de meesten." },

    // Early answer: the next clue answered while still walking to it
    { type: "early-answer", content: "Hou dat vast — jullie zijn er nog niet. Ik vraag het netjes zodra jullie er zijn." },
    { type: "early-answer", content: "Iets te vroeg daarvoor. Bewaar het tot jullie er zijn." },
    { type: "early-answer", content: "Hou die maar even achter de hand. De vraag komt als jullie op de juiste plek staan." },
  ],
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage: seed-message-banks [language|all] [--dry-run] [--clear]

Arguments:
  language   A supported language code: ${SUPPORTED_LANGUAGES.join(", ")}
  all        Seed every language, English included (the default)

Seeding only adds entries that are missing, so it is safe to re-run and never
touches admin edits. It seeds message banks only, never routes, which makes it
the right seeder for production.

Options:
  --dry-run  Print what would be inserted without touching the database
  --clear    Delete existing message bank entries for the target language(s) before inserting
             (requires an explicit language or "all"; it wipes admin edits)
`);
}

/** English lives in seed.ts, the other languages in `translations` above. */
function entriesFor(lang: SupportedLanguage): readonly MessageBankSeedEntry[] | undefined {
  return lang === "en" ? messageBankSeedData : translations[lang];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }
  const dryRun = args.includes("--dry-run");
  const clear = args.includes("--clear");
  const explicitLang = args.find((a) => !a.startsWith("--"));

  if (clear && !explicitLang) {
    console.error('Error: --clear needs an explicit language or "all".');
    printUsage();
    process.exit(1);
  }
  const langArg = explicitLang ?? "all";

  // Determine which languages to seed
  const targetLanguages: SupportedLanguage[] =
    langArg === "all"
      ? [...SUPPORTED_LANGUAGES]
      : [langArg as SupportedLanguage];

  // Validate
  for (const lang of targetLanguages) {
    if (!entriesFor(lang)) {
      console.error(
        `Error: No message bank entries for "${lang}". Available: ${SUPPORTED_LANGUAGES.join(", ")}, all`
      );
      process.exit(1);
    }
  }

  if (dryRun) {
    for (const lang of targetLanguages) {
      const entries = entriesFor(lang)!;
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
      const entries = entriesFor(lang)!;

      if (clear) {
        console.log(`Clearing existing ${lang} message bank entries...`);
        await db
          .delete(messageBanks)
          .where(eq(messageBanks.language, lang));
      }

      // Skip entries that are already present rather than the whole language.
      // Skipping wholesale meant a newly added bank type could never reach a
      // database that had been seeded before, short of --clear wiping the
      // admin's own edits along with it.
      const existing = await db
        .select({ type: messageBanks.type, content: messageBanks.content })
        .from(messageBanks)
        .where(eq(messageBanks.language, lang));

      const seen = new Set(existing.map((e) => `${e.type} ${e.content}`));
      const missing = entries.filter(
        (e) => !seen.has(`${e.type} ${e.content}`)
      );

      if (missing.length === 0) {
        console.log(
          `All ${entries.length} ${LANGUAGE_NAMES[lang]} (${lang}) entries already present. Nothing to do.`
        );
        continue;
      }

      if (existing.length > 0) {
        console.log(
          `${existing.length} ${lang} entries already exist; adding the ${missing.length} that are missing.`
        );
      }

      console.log(
        `Seeding ${missing.length} message bank entries for ${LANGUAGE_NAMES[lang]} (${lang})...`
      );
      await db.insert(messageBanks).values(
        missing.map((e) => ({
          type: e.type,
          language: lang,
          content: e.content,
        }))
      );
      console.log(`Inserted ${missing.length} entries for ${lang}.`);
    }

    console.log("Done.");
  } finally {
    await client.end();
  }
}

// Only run when invoked directly, so a test can import the translations
// without opening a database connection (same guard as seed.ts).
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
