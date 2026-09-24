import type { SupportedLanguage } from "@cityroam/shared/types";

/**
 * The matching side of the scripted "Try the Owl" demo: what counts as the
 * answer, the plausible wrong guess, a hint request and each question in the
 * little Q&A bank, per locale. The words the Owl says back live in
 * `messages/<locale>.json` under `demo.owl`, so they are translated, tested
 * for house style and never mention AI.
 *
 * These lists are only ever compared with what a visitor types; they are not
 * shown. "Are you a bot?" and "who are you?" are handled before any of this,
 * by classifyIdentityQuestion in @cityroam/shared/identity-question.
 *
 * The clue is a sample from off the route (Father Time on the Time Ball
 * Buildings, Lower Briggate). It must never be one of the route's stops: the
 * spoiler test in src/__tests__/demo.test.ts checks this file and the copy.
 *
 * Every non-English locale also accepts the English lists, the way the real
 * game does: players fall back to English whatever the game language.
 */

/** Questions the demo Owl has a scripted answer for, in the order they're tried. */
export const QA_IDS = [
  "distance",
  "route",
  "coffee",
  "price",
  "building",
  "greeting",
] as const;
export type QaId = (typeof QA_IDS)[number];

export interface DemoScript {
  /** Accepted answers. Matched with the game's own answer matcher. */
  answers: string[];
  /** The plausible wrong guess the first chip offers, and its relatives. */
  wrongGuess: string[];
  /** Half the answer: gets a "warmer" rather than a plain "no". */
  close: string[];
  /** Asking for a hint, or giving up. */
  hint: string[];
  /** A message opening with one of these is a question, not a guess. */
  questionWords: string[];
  qa: Record<QaId, string[]>;
}

export const DEMO_SCRIPTS: Record<SupportedLanguage, DemoScript> = {
  en: {
    answers: ["Father Time", "Old Man Time", "Chronos", "Kronos", "Cronus"],
    wrongGuess: ["grim reaper", "reaper", "death", "angel of death"],
    close: ["time"],
    hint: ["hint", "hints", "help", "stuck", "give up", "no idea", "the answer", "tell me", "tell us", "clue please"],
    questionWords: ["what", "whats", "why", "how", "who", "when", "where", "can", "could", "should", "would", "will", "do", "does"],
    qa: {
      distance: ["how far", "far", "distance", "how long", "much further", "how much further", "miles", "km", "kilometres", "metres", "meters"],
      route: ["real route", "actual route", "on the route", "is this the route", "real clue", "spoiler", "spoil", "spoilers"],
      coffee: ["coffee", "tea", "cafe", "lunch", "food", "eat", "drink", "pub", "pint", "toilet", "toilets", "loo", "break", "rest", "sit down"],
      price: ["price", "cost", "how much", "pounds", "expensive", "book", "booking", "pay"],
      building: ["what building", "which building", "this building", "what is this", "what s this", "where is it", "where are we", "which street", "where", "briggate"],
      greeting: ["hello", "hi", "hey", "hiya", "morning", "afternoon", "evening", "alright"],
    },
  },
  es: {
    answers: ["el Padre Tiempo", "Padre Tiempo", "Cronos", "Chronos", "Kronos"],
    wrongGuess: ["la muerte", "muerte", "la parca", "parca"],
    close: ["tiempo", "el tiempo"],
    hint: ["pista", "pistas", "ayuda", "atascado", "atascados", "atascada", "me rindo", "nos rendimos", "ni idea", "no sabemos", "la respuesta", "dime", "dinos"],
    questionWords: ["que", "como", "cuando", "donde", "por que", "quien", "cual", "puedo", "podemos", "se puede", "cuanto", "cuanta"],
    qa: {
      distance: ["cuanto falta", "a cuanto", "lejos", "distancia", "cuanto queda", "cuanto tiempo", "kilometros", "km", "metros"],
      route: ["ruta real", "la ruta de verdad", "de la ruta", "pista real", "spoiler", "destripe"],
      coffee: ["cafe", "comer", "comida", "almuerzo", "beber", "bebida", "pub", "bar", "cerveza", "bano", "banos", "aseo", "descanso", "descansar", "parar"],
      price: ["precio", "cuesta", "cuanto vale", "cuanto cuesta", "libras", "caro", "reservar", "reserva", "pagar"],
      building: ["que edificio", "cual edificio", "este edificio", "que es esto", "donde esta", "donde estamos", "que calle", "donde", "briggate"],
      greeting: ["hola", "buenas", "buenos dias", "buenas tardes", "que tal"],
    },
  },
  fr: {
    answers: ["le Père Temps", "Père Temps", "Chronos", "Cronos", "Kronos"],
    wrongGuess: ["la mort", "mort", "la faucheuse", "faucheuse", "la grande faucheuse"],
    close: ["temps", "le temps"],
    hint: ["indice", "indices", "aide", "aidez", "bloque", "bloques", "bloquee", "j abandonne", "on abandonne", "aucune idee", "la reponse", "dis nous", "dites nous"],
    questionWords: ["quoi", "que", "qu", "quel", "quelle", "comment", "quand", "ou", "pourquoi", "qui", "peut", "peux", "pouvons", "est ce", "combien"],
    qa: {
      distance: ["c est loin", "loin", "distance", "combien de temps", "il reste combien", "reste combien", "kilometres", "km", "metres"],
      route: ["vrai parcours", "vraie enigme", "du parcours", "sur le parcours", "spoiler", "divulgacher"],
      coffee: ["cafe", "dejeuner", "manger", "boire", "boisson", "pub", "bar", "biere", "toilettes", "pause", "s arreter", "arreter"],
      price: ["prix", "coute", "combien ca coute", "tarif", "livres", "cher", "reserver", "reservation", "payer"],
      building: ["quel batiment", "ce batiment", "c est quoi", "qu est ce que c est", "ou est ce", "ou sommes nous", "on est ou", "quelle rue", "briggate"],
      greeting: ["bonjour", "salut", "bonsoir", "coucou"],
    },
  },
  de: {
    answers: ["Vater Zeit", "Chronos", "Kronos"],
    wrongGuess: ["sensenmann", "der sensenmann", "der tod", "tod", "gevatter tod"],
    close: ["zeit", "die zeit"],
    hint: ["hinweis", "hinweise", "tipp", "hilfe", "stecken fest", "komme nicht weiter", "keine ahnung", "aufgeben", "ich gebe auf", "die antwort", "sag es", "sag uns"],
    questionWords: ["was", "wie", "wann", "wo", "warum", "wer", "welche", "welcher", "welches", "kann", "konnen", "durfen", "darf", "wieso", "weshalb"],
    qa: {
      distance: ["wie weit", "weit", "entfernung", "wie lange", "noch weit", "wie viel noch", "kilometer", "km", "meter"],
      route: ["echte route", "echte strecke", "auf der route", "echtes ratsel", "spoiler", "verraten"],
      coffee: ["kaffee", "tee", "mittagessen", "essen", "trinken", "getrank", "pub", "kneipe", "bier", "toilette", "klo", "wc", "pause", "anhalten"],
      price: ["preis", "kostet", "kosten", "wie viel kostet", "pfund", "teuer", "buchen", "buchung", "bezahlen"],
      building: ["welches gebaude", "dieses gebaude", "was ist das", "wo ist das", "wo sind wir", "welche strasse", "welche straße", "wo", "briggate"],
      greeting: ["hallo", "hi", "moin", "servus", "guten tag", "guten morgen"],
    },
  },
  nl: {
    answers: ["Vader Tijd", "Chronos", "Kronos"],
    wrongGuess: ["magere hein", "de dood", "dood", "man met de zeis", "pietje de dood"],
    close: ["tijd", "de tijd"],
    hint: ["hint", "hints", "aanwijzing", "tip", "hulp", "vast", "zitten vast", "geen idee", "opgeven", "ik geef op", "het antwoord", "zeg het"],
    questionWords: ["wat", "hoe", "wanneer", "waar", "waarom", "wie", "welk", "welke", "kan", "kunnen", "mag", "mogen", "hoeveel"],
    qa: {
      distance: ["hoe ver", "ver", "afstand", "hoe lang", "hoever", "nog ver", "kilometer", "km", "meter"],
      route: ["echte route", "op de route", "echte raadsel", "echt raadsel", "spoiler", "verklappen"],
      coffee: ["koffie", "thee", "lunch", "eten", "drinken", "drankje", "pub", "kroeg", "bier", "wc", "toilet", "pauze", "stoppen"],
      price: ["prijs", "kost", "kosten", "hoeveel kost", "pond", "duur", "boeken", "boeking", "betalen"],
      building: ["welk gebouw", "dit gebouw", "wat is dit", "waar is het", "waar zijn we", "welke straat", "waar", "briggate"],
      greeting: ["hallo", "hoi", "hey", "goedemorgen", "goedemiddag", "dag"],
    },
  },
};
