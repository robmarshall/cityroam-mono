# Marketing photos

Photos for the marketing site live here and are imported statically from
`src/lib/photos.ts`, so next/image knows their size and builds the responsive
versions at build time. Until a slot has a photo, the site shows a PhotoSlot
placeholder (stone panel, line map, owl), so nothing breaks while this folder
is empty.

## Adding a photo

1. Export the crops (below) and save them here with the file names below.
2. In `src/lib/photos.ts`, import them and replace the slot's `null` with one
   entry: `{ desktop, mobile, focal: { x, y }, alt: { en, es, fr, de, nl } }`.
   `focal` is where the subject sits, in percent from the top left, so the
   crop keeps it in frame. Alt text describes what's in the frame.
3. Build and look at it at 1440px and 390px wide.

## Export settings

- JPEG, sRGB, quality 80–85, lower-case `.jpg`.
- Long edge: heroes **2560 px**, section and audience shots **2000 px**.
- Strip GPS and location EXIF. Keep the copyright in IPTC.
- Leave room for text on the left or top third of heroes (they get a dark
  fade and the headline on top).

## Expected files

| Slot (`photos.ts`) | Shot list | Files | Crops |
| --- | --- | --- | --- |
| `homeHero` | M1 Victoria Quarter roof (M2 Thornton's Arcade clock or M12 Briggate at blue hour as alternates) | `home-hero-wide.jpg`, `home-hero-tall.jpg` | 16:9 at 2560×1440, 4:5 at 2000×2500 (min 1080×1350) |
| `families` | F1 parent and two children reading the phone | `families-wide.jpg`, `families-tall.jpg` | 16:9 at 2000×1125, 4:5 at 1600×2000 |
| `henParties` | H1 hen group laughing over a phone, daytime | `hen-parties-wide.jpg`, `hen-parties-tall.jpg` | 16:9 at 2000×1125, 4:5 at 1600×2000 |
| `teamBuilding` | T1 colleagues with two phones out | `team-building-wide.jpg`, `team-building-tall.jpg` | 16:9 at 2000×1125, 4:5 at 1600×2000 |

The audience shots appear as cards on the home page (4:3, cropped from the
wide file) and will be the audience-page heroes in Phase 4.

## Spoiler rule

The game's answers are never the subject of a large photo and are never named
in alt text or captions. Build the big imagery from places that aren't stops:
the Victoria Quarter, Thornton's Arcade, Briggate, Call Lane and Park Square.
See the shot list for the full brief and for model releases.
