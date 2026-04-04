import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CTAButton } from "@/components/CTAButton";
import { locales } from "@/i18n/config";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cityroam.co.uk";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("families.title"),
    description: t("families.description"),
    alternates: {
      languages: Object.fromEntries([
        ["x-default", `${siteUrl}/families`],
        ...locales.map((l) => [l, `${siteUrl}/${l}/families`]),
      ]),
    },
  };
}

const FEATURE_ITEMS = [
  { icon: "\u267f", key: "0" },
  { icon: "\ud83e\udde9", key: "1" },
  { icon: "\u2615", key: "2" },
  { icon: "\ud83d\udcd6", key: "3" },
  { icon: "\ud83d\udc15", key: "4" },
  { icon: "\u23f8\ufe0f", key: "5" },
];

export default async function Families() {
  const t = await getTranslations("families");
  const tc = await getTranslations("common");

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-24 text-center sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            {t("hero.title")}
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
            {t("hero.subtitle")}
          </p>
          <div className="mt-10">
            <CTAButton location="families-hero" label={t("hero.cta")} />
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-xl leading-relaxed text-gray-700">
            {t.rich("problem.text1", { b: (chunks) => <strong className="text-gray-900">{chunks}</strong> })}
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            {t("problem.text2")}
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            {t("problem.text3")}
          </p>
        </div>
      </section>

      {/* Why Families Love It */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("whyLove.title")}
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <FeatureCard
              title={t("whyLove.engaged.title")}
              description={t("whyLove.engaged.description")}
            />
            <FeatureCard
              title={t("whyLove.educational.title")}
              description={t("whyLove.educational.description")}
            />
            <FeatureCard
              title={t("whyLove.allAges.title")}
              description={t("whyLove.allAges.description")}
            />
            <FeatureCard
              title={t("whyLove.bonding.title")}
              description={t("whyLove.bonding.description")}
            />
          </div>
        </div>
      </section>

      {/* Perfect For */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("perfectFor.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            {t("perfectFor.subtitle")}
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <IconCard
              icon="\ud83d\udc74\ud83d\udc75"
              title={t("perfectFor.grandparents.title")}
              description={t("perfectFor.grandparents.description")}
            />
            <IconCard
              icon="\u2600\ufe0f"
              title={t("perfectFor.weekend.title")}
              description={t("perfectFor.weekend.description")}
            />
            <IconCard
              icon="\ud83c\udf92"
              title={t("perfectFor.holidays.title")}
              description={t("perfectFor.holidays.description")}
            />
          </div>
        </div>
      </section>

      {/* How It Works for Families */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("howItWorks.title")}
          </h2>
          <div className="mx-auto mt-12 max-w-2xl space-y-8">
            <NumberedStep
              number="1"
              title={t("howItWorks.step1Title")}
              description={t("howItWorks.step1Desc")}
            />
            <NumberedStep
              number="2"
              title={t("howItWorks.step2Title")}
              description={t("howItWorks.step2Desc")}
            />
            <NumberedStep
              number="3"
              title={t("howItWorks.step3Title")}
              description={t("howItWorks.step3Desc")}
            />
          </div>
        </div>
      </section>

      {/* Family-Friendly Features */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("features.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            {t("features.subtitle")}
          </p>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {FEATURE_ITEMS.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-4 rounded-card bg-white p-4 shadow-sm"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-gray-700 leading-relaxed">{t(`features.items.${item.key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Safety & Practical */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("safety.title")}
          </h2>
          <div className="mt-8 space-y-6 text-lg leading-relaxed text-gray-700">
            <p>
              {t("safety.text1")}
            </p>
            <p>
              {t("safety.text2")}
            </p>
            <p>
              {t("safety.text3")}
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("faq.title")}
          </h2>
          <div className="mx-auto mt-12 max-w-2xl divide-y divide-gray-200">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="py-5">
                <h3 className="text-lg font-medium text-gray-900">{t(`faq.${i}.question`)}</h3>
                <p className="mt-2 text-gray-600 leading-relaxed">{t(`faq.${i}.answer`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-500 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-2xl font-bold leading-tight text-white sm:text-3xl">
            {t("cta.text")}
          </p>
          <div className="mt-10">
            <CTAButton location="families-cta" label={t("cta.label")} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-12">
        <div className="mx-auto max-w-5xl text-center text-sm text-gray-500">
          <p>
            <a
              href="mailto:hello@cityroam.com"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              hello@cityroam.com
            </a>
          </p>
          <p className="mt-2">{tc("footer.copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-card bg-gray-50 p-6">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function IconCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-card bg-white p-6 shadow-sm text-center">
      <span className="text-4xl">{icon}</span>
      <h3 className="mt-3 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function NumberedStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
        {number}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-gray-600 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
