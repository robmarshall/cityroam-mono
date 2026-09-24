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
| `stagParties` | S1 stag group on Call Lane, one reading the clue aloud | `stag-parties-wide.jpg`, `stag-parties-tall.jpg` | 16:9 at 2000×1125, 4:5 at 1600×2000 |
| `familiesDetail` | F2 child pointing up at a detail, parent following their gaze | `families-detail.jpg` | 4:5 at 1600×2000 |
| `henPartiesDetail` | H3 bride-to-be typing an answer, friends blurred behind | `hen-parties-detail.jpg` | 4:5 at 1600×2000 |
| `teamBuildingDetail` | T2 two small teams comparing screens | `team-building-detail.jpg` | 4:5 at 1600×2000 |

The four audience shots (`families`, `henParties`, `teamBuilding`,
`stagParties`) lead their audience pages as full-bleed heroes, and appear as
cards on the home page (4:3, cropped from the wide file). The `…Detail`
shots sit beside the three reasons on each audience page, in a 4:5 box on
desktop and 16:9 on phones, so give them a subject near the middle; a single
4:5 file is enough (leave `mobile` out of the manifest entry).

There is no stag detail slot on purpose: S2 is a pint stop, and the page
doesn't sell the drinking. If an F2, H3 or T2 location is a stop on the
route or on the avoid list (Kirkgate Market, suggested for F2, is on it),
keep the building out of the frame or pick another spot.

## Spoiler rule

The game's answers are never the subject of a large photo and are never named
in alt text or captions. Build the big imagery from places that aren't stops:
the Victoria Quarter, Thornton's Arcade, Briggate, Call Lane and Park Square.
See the shot list for the full brief and for model releases.
