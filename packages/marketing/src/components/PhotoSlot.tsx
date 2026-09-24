import { getImageProps } from "next/image";
import { preload as preloadResource } from "react-dom";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { LineMap } from "@/components/LineMap";
import { OwlMark } from "@/components/OwlMark";
import { PHOTOS, type Photo, type PhotoSlotName } from "@/lib/photos";

type PlaceholderCrop = React.ComponentProps<typeof LineMap>["crop"];

/** md, where the landscape crop takes over. Keep in step with Tailwind's md. */
const DESKTOP_MEDIA = "(min-width: 48rem)";
const MOBILE_MEDIA = "(max-width: 47.99rem)";

/**
 * An art-directed photo: the landscape crop from md up, the portrait crop
 * below, both from next/image's optimiser via getImageProps and a <picture>.
 * It fills its (positioned) parent with object-cover around the focal point.
 *
 * `preload` is for the one hero at the top of the page: it adds a
 * high-priority preload per crop (each limited to its media query, so a
 * phone never fetches the desktop file) and loads eagerly. Everything else
 * is lazy.
 */
export function ArtPicture({
  photo,
  locale,
  sizes = "100vw",
  preload = false,
  className = "",
}: {
  photo: Photo;
  locale: SupportedLanguage;
  sizes?: string;
  preload?: boolean;
  className?: string;
}) {
  const common = {
    alt: photo.alt[locale],
    sizes,
    fill: true,
    loading: preload ? ("eager" as const) : ("lazy" as const),
    fetchPriority: preload ? ("high" as const) : undefined,
  };
  const desktop = getImageProps({ ...common, src: photo.desktop }).props;
  const mobile = getImageProps({ ...common, src: photo.mobile ?? photo.desktop }).props;

  if (preload) {
    for (const [props, media] of [
      [desktop, DESKTOP_MEDIA],
      [mobile, MOBILE_MEDIA],
    ] as const) {
      preloadResource(props.src, {
        as: "image",
        imageSrcSet: props.srcSet,
        imageSizes: sizes,
        fetchPriority: "high",
        media,
      });
    }
  }

  const { style, ...img } = mobile;
  return (
    <picture>
      <source media={DESKTOP_MEDIA} srcSet={desktop.srcSet} sizes={sizes} />
      <img
        {...img}
        alt={photo.alt[locale]}
        className={`object-cover ${className}`}
        style={{ ...style, objectPosition: `${photo.focal.x}% ${photo.focal.y}%` }}
      />
    </picture>
  );
}

/**
 * The stand-in for a photo that hasn't been taken yet: a stone panel with a
 * quiet crop of the line map, the owl in the corner and, usually, one of the
 * Owl's notes. It is meant to look like a page from a guidebook rather than
 * a missing image, so there is no "photo coming soon" text, no grey box and
 * no broken-image icon.
 *
 * `crop` picks which stretch of the line shows, so neighbouring
 * placeholders don't look identical.
 */
export function PhotoPlaceholder({
  crop = "full",
  className = "",
  children,
}: {
  crop?: PlaceholderCrop;
  className?: string;
  /** Usually an <Annotation>. */
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden bg-stone-100 ring-1 ring-inset ring-stone-200 ${className}`}>
      <div aria-hidden="true" className="absolute inset-0">
        <LineMap variant="backdrop" crop={crop} />
      </div>
      <OwlMark size={28} className="absolute right-4 bottom-4 text-ink-500 opacity-60" />
      {children}
    </div>
  );
}

/**
 * A photo slot from the manifest in lib/photos.ts: the photo when it exists,
 * the placeholder until then. The box keeps the same size either way, so
 * adding the photo never moves the layout.
 */
export function PhotoSlot({
  slot,
  locale,
  sizes,
  crop,
  className = "",
  children,
}: {
  slot: PhotoSlotName;
  locale: SupportedLanguage;
  sizes: string;
  crop?: PlaceholderCrop;
  /** Size and shape of the box (aspect ratio, rounding). */
  className?: string;
  /** Annotations, shown over the photo or the placeholder alike. */
  children?: React.ReactNode;
}) {
  const photo = PHOTOS[slot];
  if (!photo) {
    return (
      <PhotoPlaceholder crop={crop} className={className}>
        {children}
      </PhotoPlaceholder>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-stone-100 ${className}`}>
      <ArtPicture photo={photo} locale={locale} sizes={sizes} />
      {children}
    </div>
  );
}
