import type { SupportedLanguage } from "@cityroam/shared/types";
import { ArtPicture, PhotoPlaceholder } from "@/components/PhotoSlot";
import type { PhotoSlotName } from "@/lib/photos";
import { PHOTOS } from "@/lib/photos";

/**
 * The top of a page. With a photo in the manifest it is a full-bleed image
 * (16:9 from md, 4:5 on phones) with a dark navy fade behind the text, and
 * the photo is preloaded as the page's likely LCP image. Without one, the
 * text sits on the stone page beside a PhotoPlaceholder panel, and the
 * headline is the LCP element.
 *
 * `children` renders the headline block and is told which ground it sits
 * on, so it can pick stone text and the inverse button over the photo (brick
 * never goes on the dark fade) and navy text with the brick button on stone.
 * `notes` are Annotations placed with `at` over the photo or the panel.
 */
export function PhotoHero({
  slot,
  locale,
  notes,
  children,
}: {
  slot: PhotoSlotName;
  locale: SupportedLanguage;
  notes?: React.ReactNode;
  children: (ground: "photo" | "stone") => React.ReactNode;
}) {
  const photo = PHOTOS[slot];

  if (!photo) {
    return (
      <section className="overflow-hidden bg-stone-50 px-6 pt-12 pb-16 sm:pt-16 lg:pb-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
          <div className="text-center lg:text-left">{children("stone")}</div>
          <PhotoPlaceholder className="flex aspect-[4/3] items-end rounded-card p-4 md:aspect-[5/4] md:p-0 lg:aspect-[4/5]">
            {notes}
          </PhotoPlaceholder>
        </div>
      </section>
    );
  }

  return (
    <section className="on-dark relative isolate overflow-hidden bg-ink-900">
      <ArtPicture photo={photo} locale={locale} preload className="-z-10" />
      {/* The fade: up from the bottom on phones, in from the left from md. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-t from-ink-900/95 via-ink-900/65 to-ink-900/15 md:bg-linear-to-r md:from-ink-900/90 md:via-ink-900/60 md:to-ink-900/5"
      />
      <div className="relative mx-auto flex min-h-[min(125vw,100svh)] max-w-5xl items-end px-6 pt-32 pb-12 md:min-h-[min(56.25vw,760px)] md:items-center md:py-24">
        <div className="max-w-xl">{children("photo")}</div>
        {/* The notes' percentages are of the right-hand side of the photo,
            the same box they use on the placeholder panel. No room on phones. */}
        {notes && <div className="absolute inset-y-0 right-6 hidden w-[42%] md:block">{notes}</div>}
      </div>
    </section>
  );
}
