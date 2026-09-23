import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CTAButton } from "@/components/CTAButton";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "henParties");
}

const SPECIAL_ITEMS = [
  { icon: "\ud83d\udcf7", key: "0" },
  { icon: "\ud83e\udd1d", key: "1" },
  { icon: "\u23f0", key: "2" },
  { icon: "\ud83d\udc96", key: "3" },
  { icon: "\ud83e\udd42", key: "4" },
  { icon: "\ud83d\udccb", key: "5" },
];

export default async function HenParties({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("henParties");

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
            <CTAButton location="hen-hero" segment="hen-parties" label={t("hero.cta")} />
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

      {/* Why Hen Parties Love It */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("whyLove.title")}
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <FeatureCard
              title={t("whyLove.different.title")}
              description={t("whyLove.different.description")}
            />
            <FeatureCard
              title={t("whyLove.group.title")}
              description={t("whyLove.group.description")}
            />
            <FeatureCard
              title={t("whyLove.instagram.title")}
              description={t("whyLove.instagram.description")}
            />
            <FeatureCard
              title={t("whyLove.timing.title")}
              description={t("whyLove.timing.description")}
            />
          </div>
        </div>
      </section>

      {/* Perfect For Every Style */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("styles.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            {t("styles.subtitle")}
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <IconCard
              icon={"\u2600\ufe0f"}
              title={t("styles.daytime.title")}
              description={t("styles.daytime.description")}
            />
            <IconCard
              icon={"\u2728"}
              title={t("styles.alternative.title")}
              description={t("styles.alternative.description")}
            />
            <IconCard
              icon={"\ud83d\udc95"}
              title={t("styles.mixed.title")}
              description={t("styles.mixed.description")}
            />
          </div>
        </div>
      </section>

      {/* Easy Coordination */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("organise.title")}
          </h2>
          <div className="mx-auto mt-12 max-w-3xl grid gap-6 sm:grid-cols-2">
            <div className="rounded-card bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("organise.perfectSize.title")}
              </h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                {t("organise.perfectSize.description")}
              </p>
            </div>
            <div className="rounded-card bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {t("organise.simple.title")}
              </h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                {t("organise.simple.description")}
              </p>
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-3xl">
            <div className="rounded-card border border-brand-200 bg-brand-50 p-6 text-center">
              <h3 className="text-lg font-semibold text-brand-800">
                {t("organise.special.title")}
              </h3>
              <p className="mt-2 text-brand-700 leading-relaxed">
                {t("organise.special.description")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What Makes It Special */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("special.title")}
          </h2>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {SPECIAL_ITEMS.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-4 rounded-card bg-white p-4 shadow-sm"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-gray-700 leading-relaxed">{t(`special.items.${item.key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Practical Info */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("safety.title")}
          </h2>
          <div className="mt-8 space-y-6 text-lg leading-relaxed text-gray-700">
            <p>{t("safety.text1")}</p>
            <p>{t("safety.text2")}</p>
            <p>{t("safety.text3")}</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("testimonials.title")}
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-card bg-white p-6 shadow-sm">
                <p className="text-gray-700 leading-relaxed italic">
                  &ldquo;{t(`testimonials.${i}.quote`)}&rdquo;
                </p>
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-900">{t(`testimonials.${i}.name`)}</p>
                  <p className="text-sm text-gray-500">{t(`testimonials.${i}.occasion`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 sm:py-24">
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
            <CTAButton location="hen-cta" segment="hen-parties" label={t("cta.label")} />
          </div>
        </div>
      </section>
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
