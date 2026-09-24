import { useTranslations } from "next-intl";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { Link } from "@/i18n/navigation";
import { PhotoSlot } from "@/components/PhotoSlot";
import type { PhotoSlotName } from "@/lib/photos";

/**
 * One card per audience page, each with its photo slot (the same shot leads
 * that page's hero). The whole card is the link.
 */
const AUDIENCES: {
  key: "families" | "henParties" | "teamBuilding" | "stagParties";
  href: "/families" | "/hen-parties" | "/team-building" | "/stag-parties";
  slot: PhotoSlotName;
  crop: "north" | "east" | "south" | "full";
}[] = [
  { key: "families", href: "/families", slot: "families", crop: "north" },
  { key: "henParties", href: "/hen-parties", slot: "henParties", crop: "east" },
  { key: "teamBuilding", href: "/team-building", slot: "teamBuilding", crop: "south" },
  { key: "stagParties", href: "/stag-parties", slot: "stagParties", crop: "full" },
];

export function AudienceCards({ locale }: { locale: SupportedLanguage }) {
  const t = useTranslations("home.audiences");

  return (
    <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {AUDIENCES.map(({ key, href, slot, crop }) => (
        <li key={key}>
          <Link
            href={href}
            className="group flex h-full flex-col overflow-hidden rounded-card bg-stone-50 ring-1 ring-stone-200 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none"
          >
            <PhotoSlot
              slot={slot}
              locale={locale}
              crop={crop}
              sizes="(min-width: 64rem) 15rem, (min-width: 40rem) 50vw, 100vw"
              className="aspect-[16/9] sm:aspect-[4/3]"
            />
            <div className="flex flex-1 flex-col p-6">
              <h3 className="font-display text-xl font-semibold text-ink-900">{t(`${key}.title`)}</h3>
              <p className="mt-2 flex-1 leading-relaxed text-muted">{t(`${key}.text`)}</p>
              <p className="mt-4 text-sm font-semibold text-brick-600 group-hover:underline group-hover:underline-offset-4">
                {t("more")}
                <span aria-hidden="true"> →</span>
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
