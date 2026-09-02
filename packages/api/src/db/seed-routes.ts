import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import postgres from "postgres";
import { pathToFileURL } from "node:url";
import { routeFamilies } from "./schema/route-families.js";
import { routes } from "./schema/routes.js";
import { routeGroups } from "./schema/route-groups.js";
import { routeBlocks } from "./schema/route-blocks.js";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "@cityroam/shared/constants";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://cityroam:cityroam@postgres:5432/cityroam";

// ---------------------------------------------------------------------------
// Route data types
// ---------------------------------------------------------------------------

type BlockData = {
  type: "message" | "image" | "question" | "action" | "map";
  config: Record<string, unknown>;
  delay_ms: number;
};

type GroupData = {
  name: string;
  blocks: BlockData[];
};

type RouteData = {
  name: string;
  description: string;
  estimated_duration_mins: number;
  estimated_distance_km: string;
  is_active: boolean;
  groups: GroupData[];
};

// ---------------------------------------------------------------------------
// English route — "Leeds City Centre Discovery"
// Based on the content guide worked example, extended to 5 groups for a
// full ~60 minute, ~2.5km route.
// ---------------------------------------------------------------------------

const enRoute: RouteData = {
  name: "Leeds City Centre Discovery",
  description:
    "A walking tour through the historic heart of Leeds, covering its grandest civic buildings and hidden stories.",
  estimated_duration_mins: 60,
  estimated_distance_km: "2.5",
  is_active: true,
  groups: [
    // -- Group 0: Introduction --
    {
      name: "Introduction",
      blocks: [
        {
          type: "message",
          config: {
            type: "message",
            content: "Right then. Welcome to {{CITY_NAME}}.",
          },
          delay_ms: 0,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "I know these streets better than most. You just need to keep up.",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "I'll give you a clue at each stop. You figure it out, we move on.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "{{TOTAL_STOPS}} stops, roughly {{DISTANCE_KM}}km. Should take about an hour if you don't dawdle.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "If you get stuck, ask for a hint. I won't judge. Much.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Head to The Headrow in the city centre. Look for the building with the tall columns — hard to miss.",
          },
          delay_ms: 3000,
        },
      ],
    },

    // -- Group 1: Leeds Town Hall --
    {
      name: "Leeds Town Hall",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "I stand with columns tall and proud, where justice once was served aloud. Victoria laid my cornerstone — now concerts fill my halls of stone.",
            accepted_answers: ["Leeds Town Hall", "Town Hall", "the Town Hall"],
            hints: [
              [
                {
                  content:
                    "Think civic buildings — this one has Corinthian columns.",
                  image_url: null,
                  delay_ms: 0,
                },
              ],
              [
                {
                  content:
                    "It's on The Headrow, opened in 1858 by Queen Victoria.",
                  image_url: null,
                  delay_ms: 0,
                },
              ],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: {
            type: "image",
            image_url: "{{IMAGE:leeds-town-hall-facade}}",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Brodrick designed this when he was 30. He died in poverty in Paris. Architecture's a tough business.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "The organ inside has over 6,500 pipes. They still use it for concerts every month.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: {
            type: "map",
            google_maps_link: "https://maps.google.com/?q=Leeds+Town+Hall",
          },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Walk south down Vicar Lane, past the markets. About 5 minutes.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Kirkgate Market on your right is one of the largest covered markets in Europe. Worth a look on the way back.",
          },
          delay_ms: 45000,
        },
        {
          type: "image",
          config: {
            type: "image",
            image_url: "{{IMAGE:kirkgate-market-exterior}}",
          },
          delay_ms: 15000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "You'll pass a narrow alley on your left just before the church. That's where the first Leeds newspaper was printed.",
          },
          delay_ms: 90000,
        },
      ],
    },

    // -- Group 2: Corn Exchange --
    {
      name: "Corn Exchange",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "My roof is round, my trades have changed — from grain to vintage, rearranged. Step inside my oval hall, where independent traders fill each stall.",
            accepted_answers: [
              "Corn Exchange",
              "Leeds Corn Exchange",
              "the Corn Exchange",
            ],
            hints: [
              [
                {
                  content:
                    "This building was originally for trading grain.",
                  image_url: null,
                  delay_ms: 0,
                },
              ],
              [
                {
                  content:
                    "It has a distinctive oval shape and domed glass roof, built in 1863.",
                  image_url: null,
                  delay_ms: 0,
                },
              ],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: {
            type: "image",
            image_url: "{{IMAGE:corn-exchange-dome}}",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Another Brodrick design. The elliptical shape was revolutionary for 1863 — engineers weren't sure the roof would hold.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "It nearly got demolished in the 1980s. Locals fought to save it. Now it's Grade I listed and full of independent shops.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: {
            type: "map",
            google_maps_link:
              "https://maps.google.com/?q=Leeds+Corn+Exchange",
          },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Head east along Kirkgate. You'll see a church with a dark stone tower on your left after about 3 minutes.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "The narrow streets around here are some of the oldest in Leeds. Medieval street plan, more or less.",
          },
          delay_ms: 40000,
        },
      ],
    },

    // -- Group 3: Leeds Minster --
    {
      name: "Leeds Minster",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "A parish church no more, I've been promoted. Dark stone, a modest tower, and centuries of the city's prayers inside my walls.",
            accepted_answers: [
              "Leeds Minster",
              "the Minster",
              "Leeds Parish Church",
              "St Peter's",
            ],
            hints: [
              [
                {
                  content:
                    "This place of worship sits on Kirkgate. It was upgraded from a parish church in 2012.",
                  image_url: null,
                  delay_ms: 0,
                },
              ],
              [
                {
                  content:
                    "Look for the building with the dark stone tower on Kirkgate. It's been a church since the 7th century.",
                  image_url: null,
                  delay_ms: 0,
                },
              ],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: {
            type: "image",
            image_url: "{{IMAGE:leeds-minster-exterior}}",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "There's been a church on this spot since around 627 AD. The current building is mostly Victorian, but the site is ancient.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "The churchyard has a memorial to victims of a cholera outbreak in 1832. Over 700 people died in the city that year.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: {
            type: "map",
            google_maps_link: "https://maps.google.com/?q=Leeds+Minster",
          },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Walk north up Briggate — the main shopping street. About 5 minutes to the next stop.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Briggate has been the city's high street since the 13th century. The name means 'bridge road' in Old Norse.",
          },
          delay_ms: 50000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Look out for the ornate arcades on your left. The Victorians built shopping centres too — they just made them beautiful.",
          },
          delay_ms: 90000,
        },
      ],
    },

    // -- Group 4: Leeds Art Gallery --
    {
      name: "Leeds Art Gallery",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "I sit between a library and a monument to the queen. Inside, Henry Moore's work hangs where it first caught the public eye.",
            accepted_answers: [
              "Leeds Art Gallery",
              "Art Gallery",
              "the Art Gallery",
              "Leeds City Art Gallery",
            ],
            hints: [
              [
                {
                  content:
                    "This gallery is on The Headrow, right next to the Central Library.",
                  image_url: null,
                  delay_ms: 0,
                },
              ],
              [
                {
                  content:
                    "Opened in 1888, it sits between the library and the Queen Victoria statue. Free to enter.",
                  image_url: null,
                  delay_ms: 0,
                },
              ],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: {
            type: "image",
            image_url: "{{IMAGE:leeds-art-gallery-entrance}}",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "Henry Moore was a Leeds lad. He studied at the art school next door. His early work still hangs here.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content:
              "The tiled entrance hall is worth a look if you have time. It hasn't changed much since 1888.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: {
            type: "map",
            google_maps_link:
              "https://maps.google.com/?q=Leeds+Art+Gallery",
          },
          delay_ms: 500,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Spanish translation
// ---------------------------------------------------------------------------

const esRoute: RouteData = {
  name: "Descubriendo el Centro de Leeds",
  description:
    "Un paseo por el corazón histórico de Leeds, recorriendo sus edificios cívicos más imponentes y sus historias ocultas.",
  estimated_duration_mins: 60,
  estimated_distance_km: "2.5",
  is_active: true,
  groups: [
    {
      name: "Introducción",
      blocks: [
        {
          type: "message",
          config: { type: "message", content: "Bueno. Bienvenidos a {{CITY_NAME}}." },
          delay_ms: 0,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Conozco estas calles mejor que la mayoría. Vosotros solo tenéis que seguir el ritmo.",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Os daré una pista en cada parada. La resolváis y seguimos.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "{{TOTAL_STOPS}} paradas, unos {{DISTANCE_KM}}km. Debería llevar una hora si no os entretenéis.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Si os quedáis atascados, pedid una pista. No juzgo. Mucho.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Id hacia The Headrow en el centro. Buscad el edificio con las columnas altas — difícil de pasar por alto.",
          },
          delay_ms: 3000,
        },
      ],
    },
    {
      name: "Leeds Town Hall",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Me alzo con columnas altas y orgullosas, donde la justicia se dictó en voz alta. Victoria puso mi primera piedra — ahora los conciertos llenan mis salas de piedra.",
            accepted_answers: ["Leeds Town Hall", "Town Hall", "Ayuntamiento de Leeds", "el Ayuntamiento"],
            hints: [
              [{ content: "Pensad en edificios cívicos — este tiene columnas corintias.", image_url: null, delay_ms: 0 }],
              [{ content: "Está en The Headrow, inaugurado en 1858 por la Reina Victoria.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-town-hall-facade}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Brodrick lo diseñó con 30 años. Murió en la pobreza en París. La arquitectura es un negocio duro.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "El órgano del interior tiene más de 6.500 tubos. Todavía lo usan para conciertos cada mes.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Town+Hall" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Caminad hacia el sur por Vicar Lane, pasando los mercados. Unos 5 minutos.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Kirkgate Market a vuestra derecha es uno de los mercados cubiertos más grandes de Europa. Merece la pena volver luego.",
          },
          delay_ms: 45000,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:kirkgate-market-exterior}}" },
          delay_ms: 15000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Pasaréis un callejón estrecho a vuestra izquierda justo antes de la iglesia. Ahí se imprimió el primer periódico de Leeds.",
          },
          delay_ms: 90000,
        },
      ],
    },
    {
      name: "Corn Exchange",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Mi techo es redondo, mis oficios han cambiado — de grano a vintage, reordenado. Entrad en mi sala ovalada, donde comerciantes independientes llenan cada puesto.",
            accepted_answers: ["Corn Exchange", "Leeds Corn Exchange", "Lonja de Cereales", "la Lonja de Cereales"],
            hints: [
              [{ content: "Este edificio se usaba originalmente para comerciar grano.", image_url: null, delay_ms: 0 }],
              [{ content: "Tiene una forma ovalada distintiva y un techo abovedado de cristal, construido en 1863.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:corn-exchange-dome}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Otro diseño de Brodrick. La forma elíptica fue revolucionaria en 1863 — los ingenieros no estaban seguros de que el techo aguantaría.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Casi lo demolieron en los 80. Los vecinos lucharon por salvarlo. Ahora es monumento protegido y está lleno de tiendas independientes.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Corn+Exchange" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Seguid hacia el este por Kirkgate. Veréis una iglesia con una torre de piedra oscura a vuestra izquierda en unos 3 minutos.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Las calles estrechas de aquí son de las más antiguas de Leeds. Trazado medieval, más o menos.",
          },
          delay_ms: 40000,
        },
      ],
    },
    {
      name: "Leeds Minster",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Ya no soy una simple parroquia, me han ascendido. Piedra oscura, una torre modesta y siglos de oraciones de la ciudad entre mis muros.",
            accepted_answers: ["Leeds Minster", "the Minster", "Leeds Parish Church", "la Catedral de Leeds"],
            hints: [
              [{ content: "Este templo está en Kirkgate. Pasó de ser parroquia a catedral en 2012.", image_url: null, delay_ms: 0 }],
              [{ content: "Buscad el edificio con la torre de piedra oscura en Kirkgate. Ha sido iglesia desde el siglo VII.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-minster-exterior}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Ha habido una iglesia en este lugar desde aproximadamente el 627 d.C. El edificio actual es mayormente victoriano, pero el emplazamiento es antiguo.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "El cementerio tiene un memorial a las víctimas de una epidemia de cólera en 1832. Más de 700 personas murieron en la ciudad ese año.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Minster" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Caminad hacia el norte por Briggate — la calle comercial principal. Unos 5 minutos hasta la siguiente parada.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Briggate ha sido la calle principal de la ciudad desde el siglo XIII. El nombre significa 'camino del puente' en nórdico antiguo.",
          },
          delay_ms: 50000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Fijaos en las galerías ornamentadas a vuestra izquierda. Los victorianos también construían centros comerciales — solo que los hacían bonitos.",
          },
          delay_ms: 90000,
        },
      ],
    },
    {
      name: "Leeds Art Gallery",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Me siento entre una biblioteca y un monumento a la reina. Dentro, la obra de Henry Moore cuelga donde captó la atención del público por primera vez.",
            accepted_answers: ["Leeds Art Gallery", "Art Gallery", "Galería de Arte de Leeds", "la Galería de Arte"],
            hints: [
              [{ content: "Esta galería está en The Headrow, justo al lado de la Biblioteca Central.", image_url: null, delay_ms: 0 }],
              [{ content: "Inaugurada en 1888, se encuentra entre la biblioteca y la estatua de la Reina Victoria. Entrada gratuita.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-art-gallery-entrance}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Henry Moore era de Leeds. Estudió en la escuela de arte de al lado. Sus primeras obras todavía cuelgan aquí.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "El vestíbulo con azulejos merece un vistazo si tenéis tiempo. No ha cambiado mucho desde 1888.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Art+Gallery" },
          delay_ms: 500,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// French translation
// ---------------------------------------------------------------------------

const frRoute: RouteData = {
  name: "Découverte du Centre de Leeds",
  description:
    "Une promenade au cœur historique de Leeds, à travers ses plus grands édifices civiques et ses histoires cachées.",
  estimated_duration_mins: 60,
  estimated_distance_km: "2.5",
  is_active: true,
  groups: [
    {
      name: "Introduction",
      blocks: [
        {
          type: "message",
          config: { type: "message", content: "Bon. Bienvenue à {{CITY_NAME}}." },
          delay_ms: 0,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Je connais ces rues mieux que la plupart. Vous n'avez qu'à suivre.",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Je vous donne un indice à chaque arrêt. Vous trouvez, on avance.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "{{TOTAL_STOPS}} arrêts, environ {{DISTANCE_KM}}km. Ça devrait prendre une heure si vous ne traînez pas.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Si vous bloquez, demandez un indice. Je ne juge pas. Pas trop.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Dirigez-vous vers The Headrow dans le centre. Cherchez le bâtiment avec les grandes colonnes — difficile à rater.",
          },
          delay_ms: 3000,
        },
      ],
    },
    {
      name: "Leeds Town Hall",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Je me dresse avec des colonnes hautes et fières, où la justice autrefois était rendue. Victoria posa ma première pierre — maintenant les concerts emplissent mes salles de pierre.",
            accepted_answers: ["Leeds Town Hall", "Town Hall", "Hôtel de Ville de Leeds", "l'Hôtel de Ville"],
            hints: [
              [{ content: "Pensez aux bâtiments civiques — celui-ci a des colonnes corinthiennes.", image_url: null, delay_ms: 0 }],
              [{ content: "Il est sur The Headrow, inauguré en 1858 par la Reine Victoria.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-town-hall-facade}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Brodrick l'a conçu à 30 ans. Il est mort dans la pauvreté à Paris. L'architecture, c'est dur.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "L'orgue à l'intérieur compte plus de 6 500 tuyaux. Il sert encore pour des concerts chaque mois.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Town+Hall" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Descendez Vicar Lane vers le sud, en passant devant les marchés. Environ 5 minutes.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Kirkgate Market sur votre droite est l'un des plus grands marchés couverts d'Europe. Ça vaut le détour au retour.",
          },
          delay_ms: 45000,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:kirkgate-market-exterior}}" },
          delay_ms: 15000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Vous passerez une ruelle étroite sur votre gauche juste avant l'église. C'est là que le premier journal de Leeds a été imprimé.",
          },
          delay_ms: 90000,
        },
      ],
    },
    {
      name: "Corn Exchange",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Mon toit est rond, mes commerces ont changé — du grain au vintage, tout a été réaménagé. Entrez dans ma salle ovale, où des commerçants indépendants remplissent chaque stand.",
            accepted_answers: ["Corn Exchange", "Leeds Corn Exchange", "Bourse aux Céréales", "la Bourse aux Céréales"],
            hints: [
              [{ content: "Ce bâtiment servait à l'origine au commerce des céréales.", image_url: null, delay_ms: 0 }],
              [{ content: "Il a une forme ovale distinctive et un toit en verre en dôme, construit en 1863.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:corn-exchange-dome}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Encore un projet de Brodrick. La forme elliptique était révolutionnaire en 1863 — les ingénieurs n'étaient pas sûrs que le toit tiendrait.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Il a failli être démoli dans les années 80. Les habitants se sont battus pour le sauver. Il est maintenant classé et plein de boutiques indépendantes.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Corn+Exchange" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Continuez vers l'est le long de Kirkgate. Vous verrez une église avec une tour en pierre sombre sur votre gauche dans environ 3 minutes.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Les ruelles étroites autour d'ici comptent parmi les plus anciennes de Leeds. Un plan médiéval, plus ou moins.",
          },
          delay_ms: 40000,
        },
      ],
    },
    {
      name: "Leeds Minster",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Simple paroisse, je ne suis plus. On m'a promu. Pierre sombre, une tour modeste, et des siècles de prières de la ville entre mes murs.",
            accepted_answers: ["Leeds Minster", "the Minster", "Leeds Parish Church", "la Cathédrale de Leeds"],
            hints: [
              [{ content: "Ce lieu de culte se trouve sur Kirkgate. Il est passé de paroisse à cathédrale en 2012.", image_url: null, delay_ms: 0 }],
              [{ content: "Cherchez le bâtiment avec la tour en pierre sombre sur Kirkgate. C'est une église depuis le VIIe siècle.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-minster-exterior}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Il y a eu une église ici depuis environ 627 après J.-C. Le bâtiment actuel est principalement victorien, mais le site est ancien.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Le cimetière abrite un mémorial aux victimes d'une épidémie de choléra en 1832. Plus de 700 personnes sont mortes dans la ville cette année-là.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Minster" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Remontez Briggate vers le nord — la rue commerçante principale. Environ 5 minutes jusqu'au prochain arrêt.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Briggate est la rue principale de la ville depuis le XIIIe siècle. Le nom signifie 'chemin du pont' en vieux norrois.",
          },
          delay_ms: 50000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Regardez les galeries ornées sur votre gauche. Les Victoriens construisaient aussi des centres commerciaux — mais en les faisant beaux.",
          },
          delay_ms: 90000,
        },
      ],
    },
    {
      name: "Leeds Art Gallery",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Je suis entre une bibliothèque et un monument à la reine. À l'intérieur, l'œuvre de Henry Moore est exposée là où elle a attiré l'attention du public pour la première fois.",
            accepted_answers: ["Leeds Art Gallery", "Art Gallery", "Galerie d'Art de Leeds", "la Galerie d'Art"],
            hints: [
              [{ content: "Cette galerie est sur The Headrow, juste à côté de la Bibliothèque Centrale.", image_url: null, delay_ms: 0 }],
              [{ content: "Ouverte en 1888, elle se trouve entre la bibliothèque et la statue de la Reine Victoria. Entrée gratuite.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-art-gallery-entrance}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Henry Moore était de Leeds. Il a étudié à l'école d'art d'à côté. Ses premières œuvres sont encore ici.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Le hall d'entrée carrelé vaut le coup d'œil si vous avez le temps. Il n'a pas beaucoup changé depuis 1888.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Art+Gallery" },
          delay_ms: 500,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// German translation
// ---------------------------------------------------------------------------

const deRoute: RouteData = {
  name: "Leeds Innenstadt Entdeckung",
  description:
    "Ein Spaziergang durch das historische Herz von Leeds, vorbei an den großartigsten Gebäuden und versteckten Geschichten.",
  estimated_duration_mins: 60,
  estimated_distance_km: "2.5",
  is_active: true,
  groups: [
    {
      name: "Einführung",
      blocks: [
        {
          type: "message",
          config: { type: "message", content: "Gut. Willkommen in {{CITY_NAME}}." },
          delay_ms: 0,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Ich kenne diese Straßen besser als die meisten. Ihr müsst nur mithalten.",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "An jeder Station gebe ich euch ein Rätsel. Ihr löst es, wir gehen weiter.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "{{TOTAL_STOPS}} Stationen, ungefähr {{DISTANCE_KM}}km. Sollte etwa eine Stunde dauern, wenn ihr euch nicht trödelt.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Wenn ihr nicht weiterkommt, fragt nach einem Hinweis. Ich urteile nicht. Nicht sehr.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Geht Richtung The Headrow im Stadtzentrum. Sucht das Gebäude mit den hohen Säulen — kaum zu übersehen.",
          },
          delay_ms: 3000,
        },
      ],
    },
    {
      name: "Leeds Town Hall",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Ich stehe mit hohen Säulen, stolz und stark, wo einst das Recht gesprochen ward. Victoria legte meinen Grundstein — jetzt füllen Konzerte meine Hallen aus Stein.",
            accepted_answers: ["Leeds Town Hall", "Town Hall", "Rathaus Leeds", "das Rathaus"],
            hints: [
              [{ content: "Denkt an öffentliche Gebäude — dieses hat korinthische Säulen.", image_url: null, delay_ms: 0 }],
              [{ content: "Es steht an The Headrow, eröffnet 1858 von Königin Victoria.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-town-hall-facade}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Brodrick entwarf das mit 30 Jahren. Er starb verarmt in Paris. Architektur ist ein hartes Geschäft.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Die Orgel drinnen hat über 6.500 Pfeifen. Sie wird immer noch jeden Monat für Konzerte benutzt.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Town+Hall" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Geht südlich die Vicar Lane hinunter, an den Märkten vorbei. Etwa 5 Minuten.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Kirkgate Market rechts von euch ist einer der größten überdachten Märkte Europas. Lohnt sich auf dem Rückweg.",
          },
          delay_ms: 45000,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:kirkgate-market-exterior}}" },
          delay_ms: 15000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Ihr kommt an einer schmalen Gasse links vorbei, kurz vor der Kirche. Dort wurde die erste Zeitung von Leeds gedruckt.",
          },
          delay_ms: 90000,
        },
      ],
    },
    {
      name: "Corn Exchange",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Mein Dach ist rund, mein Handel hat sich gewandelt — von Getreide zu Vintage, neu sortiert. Tretet ein in meine ovale Halle, wo unabhängige Händler jeden Stand füllen.",
            accepted_answers: ["Corn Exchange", "Leeds Corn Exchange", "Kornbörse", "die Kornbörse"],
            hints: [
              [{ content: "Dieses Gebäude diente ursprünglich dem Getreidehandel.", image_url: null, delay_ms: 0 }],
              [{ content: "Es hat eine markante ovale Form und ein verglastes Kuppeldach, erbaut 1863.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:corn-exchange-dome}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Noch ein Entwurf von Brodrick. Die elliptische Form war 1863 revolutionär — Ingenieure waren sich nicht sicher, ob das Dach halten würde.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "In den 80ern wäre es fast abgerissen worden. Die Anwohner kämpften für den Erhalt. Jetzt steht es unter Denkmalschutz und ist voller unabhängiger Läden.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Corn+Exchange" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Geht weiter östlich die Kirkgate entlang. Ihr seht eine Kirche mit einem dunklen Steinturm links nach etwa 3 Minuten.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Die engen Gassen hier gehören zu den ältesten in Leeds. Mittelalterlicher Straßenplan, mehr oder weniger.",
          },
          delay_ms: 40000,
        },
      ],
    },
    {
      name: "Leeds Minster",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Nur eine Pfarrkirche bin ich nicht mehr, man hat mich befördert. Dunkler Stein, ein bescheidener Turm und Jahrhunderte von Gebeten der Stadt in meinen Mauern.",
            accepted_answers: ["Leeds Minster", "the Minster", "Leeds Parish Church", "das Münster"],
            hints: [
              [{ content: "Dieses Gotteshaus steht an der Kirkgate. Es wurde 2012 von einer Pfarrkirche zum Münster erhoben.", image_url: null, delay_ms: 0 }],
              [{ content: "Sucht das Gebäude mit dem dunklen Steinturm an der Kirkgate. Es ist seit dem 7. Jahrhundert eine Kirche.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-minster-exterior}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Hier steht seit etwa 627 n. Chr. eine Kirche. Das heutige Gebäude ist größtenteils viktorianisch, aber der Ort ist uralt.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Der Friedhof hat ein Denkmal für die Opfer einer Cholera-Epidemie von 1832. Über 700 Menschen starben in der Stadt in jenem Jahr.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Minster" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Geht nördlich die Briggate hinauf — die Haupteinkaufsstraße. Etwa 5 Minuten bis zur nächsten Station.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Die Briggate ist seit dem 13. Jahrhundert die Hauptstraße der Stadt. Der Name bedeutet 'Brückenweg' auf Altnordisch.",
          },
          delay_ms: 50000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Achtet auf die verzierten Passagen links. Die Viktorianer bauten auch Einkaufszentren — nur machten sie sie schön.",
          },
          delay_ms: 90000,
        },
      ],
    },
    {
      name: "Leeds Art Gallery",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Ich sitze zwischen einer Bibliothek und einem Denkmal für die Königin. Drinnen hängt Henry Moores Werk, wo es zum ersten Mal die Öffentlichkeit begeisterte.",
            accepted_answers: ["Leeds Art Gallery", "Art Gallery", "Kunstgalerie Leeds", "die Kunstgalerie"],
            hints: [
              [{ content: "Diese Galerie befindet sich an The Headrow, direkt neben der Zentralbibliothek.", image_url: null, delay_ms: 0 }],
              [{ content: "Eröffnet 1888, liegt sie zwischen der Bibliothek und der Statue von Königin Victoria. Eintritt frei.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-art-gallery-entrance}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Henry Moore war ein Junge aus Leeds. Er studierte an der Kunstschule nebenan. Seine frühen Werke hängen immer noch hier.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Die geflieste Eingangshalle ist einen Blick wert, wenn ihr Zeit habt. Sie hat sich seit 1888 kaum verändert.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Art+Gallery" },
          delay_ms: 500,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Dutch translation
// ---------------------------------------------------------------------------

const nlRoute: RouteData = {
  name: "Ontdek het Centrum van Leeds",
  description:
    "Een wandeling door het historische hart van Leeds, langs de mooiste openbare gebouwen en verborgen verhalen.",
  estimated_duration_mins: 60,
  estimated_distance_km: "2.5",
  is_active: true,
  groups: [
    {
      name: "Introductie",
      blocks: [
        {
          type: "message",
          config: { type: "message", content: "Goed. Welkom in {{CITY_NAME}}." },
          delay_ms: 0,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Ik ken deze straten beter dan de meesten. Jullie hoeven alleen maar bij te houden.",
          },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Bij elke stop geef ik jullie een raadsel. Jullie lossen het op, we gaan verder.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "{{TOTAL_STOPS}} stops, ongeveer {{DISTANCE_KM}}km. Moet ongeveer een uur duren als jullie niet treuzelen.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Als jullie vastlopen, vraag om een hint. Ik oordeel niet. Niet echt.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Ga naar The Headrow in het centrum. Zoek het gebouw met de hoge zuilen — moeilijk te missen.",
          },
          delay_ms: 3000,
        },
      ],
    },
    {
      name: "Leeds Town Hall",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Ik sta er met hoge zuilen, trots en sterk, waar recht ooit werd gesproken. Victoria legde mijn eerste steen — nu vullen concerten mijn stenen zalen.",
            accepted_answers: ["Leeds Town Hall", "Town Hall", "Stadhuis van Leeds", "het Stadhuis"],
            hints: [
              [{ content: "Denk aan openbare gebouwen — dit gebouw heeft Korinthische zuilen.", image_url: null, delay_ms: 0 }],
              [{ content: "Het staat aan The Headrow, geopend in 1858 door Koningin Victoria.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-town-hall-facade}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Brodrick ontwierp dit toen hij 30 was. Hij stierf in armoede in Parijs. Architectuur is een zwaar vak.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Het orgel binnenin heeft meer dan 6.500 pijpen. Het wordt nog steeds elke maand gebruikt voor concerten.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Town+Hall" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Loop naar het zuiden over Vicar Lane, langs de markten. Ongeveer 5 minuten.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Kirkgate Market rechts van jullie is een van de grootste overdekte markten van Europa. De moeite waard om op de terugweg te bekijken.",
          },
          delay_ms: 45000,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:kirkgate-market-exterior}}" },
          delay_ms: 15000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Jullie passeren een smal steegje links, net voor de kerk. Daar werd de eerste krant van Leeds gedrukt.",
          },
          delay_ms: 90000,
        },
      ],
    },
    {
      name: "Corn Exchange",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Mijn dak is rond, mijn handel is veranderd — van graan tot vintage, herschikt. Stap binnen in mijn ovale hal, waar onafhankelijke handelaren elke kraam vullen.",
            accepted_answers: ["Corn Exchange", "Leeds Corn Exchange", "Korenbeurs", "de Korenbeurs"],
            hints: [
              [{ content: "Dit gebouw werd oorspronkelijk gebruikt voor de graanhandel.", image_url: null, delay_ms: 0 }],
              [{ content: "Het heeft een opvallende ovale vorm en een glazen koepeldak, gebouwd in 1863.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:corn-exchange-dome}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Nog een ontwerp van Brodrick. De elliptische vorm was revolutionair in 1863 — ingenieurs waren niet zeker of het dak het zou houden.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Het werd bijna gesloopt in de jaren 80. Bewoners vochten om het te redden. Nu is het een rijksmonument, vol onafhankelijke winkels.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Corn+Exchange" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Ga verder naar het oosten over Kirkgate. Jullie zien een kerk met een donkere stenen toren links na ongeveer 3 minuten.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "De smalle straatjes hier zijn enkele van de oudste in Leeds. Middeleeuws stratenplan, min of meer.",
          },
          delay_ms: 40000,
        },
      ],
    },
    {
      name: "Leeds Minster",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Een gewone parochiekerk ben ik niet meer, ik ben gepromoveerd. Donkere steen, een bescheiden toren en eeuwen van gebeden van de stad binnen mijn muren.",
            accepted_answers: ["Leeds Minster", "the Minster", "Leeds Parish Church", "de Kathedraal van Leeds"],
            hints: [
              [{ content: "Dit gebedshuis staat aan Kirkgate. Het werd in 2012 van parochiekerk tot kathedraal verheven.", image_url: null, delay_ms: 0 }],
              [{ content: "Zoek het gebouw met de donkere stenen toren aan Kirkgate. Het is een kerk sinds de 7e eeuw.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-minster-exterior}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Er staat hier al een kerk sinds ongeveer 627 na Christus. Het huidige gebouw is grotendeels Victoriaans, maar de plek is oeroud.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Het kerkhof heeft een monument voor de slachtoffers van een cholera-epidemie in 1832. Meer dan 700 mensen stierven dat jaar in de stad.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Minster" },
          delay_ms: 500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Loop naar het noorden over Briggate — de hoofdwinkelstraat. Ongeveer 5 minuten naar de volgende stop.",
          },
          delay_ms: 4000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Briggate is de hoofdstraat van de stad sinds de 13e eeuw. De naam betekent 'brugweg' in Oud-Noors.",
          },
          delay_ms: 50000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Let op de sierlijke passages links. De Victorianen bouwden ook winkelcentra — ze maakten ze alleen mooi.",
          },
          delay_ms: 90000,
        },
      ],
    },
    {
      name: "Leeds Art Gallery",
      blocks: [
        {
          type: "question",
          config: {
            type: "question",
            clue: "Ik zit tussen een bibliotheek en een monument voor de koningin. Binnen hangt het werk van Henry Moore waar het voor het eerst de aandacht van het publiek trok.",
            accepted_answers: ["Leeds Art Gallery", "Art Gallery", "Kunstgalerie van Leeds", "de Kunstgalerie"],
            hints: [
              [{ content: "Deze galerie staat aan The Headrow, direct naast de Centrale Bibliotheek.", image_url: null, delay_ms: 0 }],
              [{ content: "Geopend in 1888, het ligt tussen de bibliotheek en het standbeeld van Koningin Victoria. Gratis entree.", image_url: null, delay_ms: 0 }],
            ],
          },
          delay_ms: 0,
        },
        {
          type: "image",
          config: { type: "image", image_url: "{{IMAGE:leeds-art-gallery-entrance}}" },
          delay_ms: 1500,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "Henry Moore kwam uit Leeds. Hij studeerde aan de kunstschool ernaast. Zijn vroege werk hangt hier nog steeds.",
          },
          delay_ms: 2000,
        },
        {
          type: "message",
          config: {
            type: "message",
            content: "De betegelde entreehal is een blik waard als jullie tijd hebben. Het is nauwelijks veranderd sinds 1888.",
          },
          delay_ms: 2500,
        },
        {
          type: "map",
          config: { type: "map", google_maps_link: "https://maps.google.com/?q=Leeds+Art+Gallery" },
          delay_ms: 500,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// All translations indexed by language
// ---------------------------------------------------------------------------

export const routesByLanguage: Record<string, RouteData> = {
  en: enRoute,
  es: esRoute,
  fr: frRoute,
  de: deRoute,
  nl: nlRoute,
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage: seed-routes <language|all> [--dry-run] [--clear]

Arguments:
  language   A supported language code: ${SUPPORTED_LANGUAGES.join(", ")}
  all        Seed all languages

Options:
  --dry-run  Print what would be inserted without touching the database
  --clear    Delete existing route (and its groups/blocks) for the target language(s) before inserting
`);
}

export const DEV_ROUTE_FAMILY = {
  name: "Leeds City Centre Discovery",
  city: "Leeds",
} as const;

/**
 * Finds the development route family, creating it only if it is missing.
 * Shared with seed.ts so `npm run seed` and `npm run seed:routes` converge on
 * one family instead of each making their own.
 */
export async function ensureDevRouteFamily(
  db: ReturnType<typeof drizzle>,
): Promise<string> {
  const families = await db
    .select()
    .from(routeFamilies)
    .where(eq(routeFamilies.name, DEV_ROUTE_FAMILY.name));

  if (families.length > 0) {
    console.log(`Found route family: "${families[0].name}" (${families[0].id})`);
    return families[0].id;
  }

  const [family] = await db
    .insert(routeFamilies)
    .values({ name: DEV_ROUTE_FAMILY.name, city: DEV_ROUTE_FAMILY.city })
    .returning();
  console.log(`Created route family: "${family.name}" (${family.id})`);
  return family.id;
}

export async function seedRoute(
  db: ReturnType<typeof drizzle>,
  familyId: string,
  language: string,
  routeData: RouteData,
  dryRun: boolean,
  clear: boolean,
): Promise<void> {
  const langName = LANGUAGE_NAMES[language as SupportedLanguage] ?? language;

  // Check for existing route in this language for this family
  const existing = await db
    .select({ id: routes.id })
    .from(routes)
    .where(and(eq(routes.route_family_id, familyId), eq(routes.language, language)));

  if (existing.length > 0 && !clear) {
    console.log(
      `  ${langName} (${language}): route already exists (id: ${existing[0].id}). Use --clear to replace.`,
    );
    return;
  }

  if (dryRun) {
    const blockCount = routeData.groups.reduce((sum, g) => sum + g.blocks.length, 0);
    console.log(
      `  [DRY RUN] ${langName} (${language}): "${routeData.name}" — ${routeData.groups.length} groups, ${blockCount} blocks`,
    );
    for (const g of routeData.groups) {
      console.log(`    ${g.name}: ${g.blocks.length} blocks`);
    }
    return;
  }

  // Clear existing route if requested (cascade deletes groups/blocks)
  if (clear && existing.length > 0) {
    console.log(`  Clearing existing ${language} route...`);
    for (const r of existing) {
      // Delete groups (blocks cascade from groups)
      await db.delete(routeGroups).where(eq(routeGroups.route_id, r.id));
      await db.delete(routes).where(eq(routes.id, r.id));
    }
  }

  // Create route
  const [route] = await db
    .insert(routes)
    .values({
      name: routeData.name,
      description: routeData.description,
      language,
      route_family_id: familyId,
      total_stops: routeData.groups.length - 1, // Exclude Introduction group (no question block)
      estimated_duration_mins: routeData.estimated_duration_mins,
      estimated_distance_km: routeData.estimated_distance_km,
      is_active: routeData.is_active,
    })
    .returning({ id: routes.id });

  let totalBlocks = 0;
  for (let gi = 0; gi < routeData.groups.length; gi++) {
    const g = routeData.groups[gi];
    const [group] = await db
      .insert(routeGroups)
      .values({
        route_id: route.id,
        position: gi,
        name: g.name,
      })
      .returning({ id: routeGroups.id });

    for (let bi = 0; bi < g.blocks.length; bi++) {
      const b = g.blocks[bi];
      await db.insert(routeBlocks).values({
        group_id: group.id,
        position: bi,
        type: b.type,
        config: b.config,
        delay_ms: b.delay_ms,
      });
      totalBlocks++;
    }
  }

  console.log(
    `  ${langName} (${language}): created "${routeData.name}" — ${routeData.groups.length} groups, ${totalBlocks} blocks (route id: ${route.id})`,
  );
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
  const targetLanguages: string[] =
    langArg === "all"
      ? SUPPORTED_LANGUAGES.slice()
      : [langArg];

  // Validate
  for (const lang of targetLanguages) {
    if (!routesByLanguage[lang]) {
      console.error(
        `Error: No route data for "${lang}". Available: ${Object.keys(routesByLanguage).join(", ")}, all`,
      );
      process.exit(1);
    }
  }

  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  try {
    const familyId = await ensureDevRouteFamily(db);

    console.log(`\nSeeding routes for: ${targetLanguages.join(", ")}`);
    for (const lang of targetLanguages) {
      await seedRoute(db, familyId, lang, routesByLanguage[lang], dryRun, clear);
    }

    console.log("\nDone.");
  } finally {
    await client.end();
  }
}

// Only run when invoked directly. seed.ts imports the route data and the
// seeding function from here, and an import must not start a second seed.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
