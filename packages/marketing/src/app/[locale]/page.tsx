import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CTAButton } from "@/components/CTAButton";
import { FAQ } from "@/components/FAQ";
import IphoneDemo from "@/components/IphoneDemo/IphoneDemo";
import { buildMetadata } from "@/lib/metadata";

const PHONE_FEATURES = [
  { icon: "📱", key: "0" },
  { icon: "☁️", key: "1" },
  { icon: "💬", key: "2" },
  { icon: "⏸️", key: "3" },
];

const INCLUDED_ITEMS = [
  { icon: "🗺️", key: "0" },
  { icon: "🧩", key: "1" },
  { icon: "🍻", key: "2" },
  { icon: "📱", key: "3" },
  { icon: "⏸️", key: "4" },
  { icon: "♿", key: "5" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata(locale, "home");
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("home");

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-24 sm:py-32 overflow-hidden">
        <div className="mx-auto max-w-5xl flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
              {t("hero.subtitle")}
            </p>
            <div className="mt-10">
              <CTAButton location="hero" />
            </div>
          </div>
          <div className="relative flex-shrink-0 rotate-3 lg:rotate-6">
            <IphoneDemo variant="hero" />
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

      {/* How It Works */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("howItWorks.title")}
          </h2>
          <div className="mt-16 grid gap-12 sm:grid-cols-2 sm:gap-8">
            <Step
              number="1"
              title={t("howItWorks.step1Title")}
              description={t("howItWorks.step1Desc")}
            />
            <Step
              number="2"
              title={t("howItWorks.step2Title")}
              description={t("howItWorks.step2Desc")}
            />
            <Step
              number="3"
              title={t("howItWorks.step3Title")}
              description={t("howItWorks.step3Desc")}
            />
            <Step
              number="4"
              title={t("howItWorks.step4Title")}
              description={t("howItWorks.step4Desc")}
            />
          </div>
        </div>
      </section>

      {/* Just Your Phone */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl flex flex-col items-center gap-12 md:flex-row md:gap-16">
          <div className="flex-1 order-2 md:order-1">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {t("phone.title")}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">
              {t("phone.subtitle")}
            </p>
            <ul className="mt-8 space-y-4">
              {PHONE_FEATURES.map((item) => (
                <li key={item.key} className="flex items-center gap-3 text-gray-700">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-lg">{t(`phone.features.${item.key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative flex-shrink-0 order-1 md:order-2 -rotate-2 md:rotate-3">
            <IphoneDemo variant="howItWorks" />
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("included.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            {t("included.subtitle")}
          </p>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {INCLUDED_ITEMS.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-4 rounded-card bg-white p-4 shadow-sm"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-gray-700 leading-relaxed">{t(`included.items.${item.key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Why Choose City Roam */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("whyChoose.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            {t("whyChoose.subtitle")}
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <FeatureCard
              icon="📚"
              title={t("whyChoose.localKnowledge.title")}
              description={t("whyChoose.localKnowledge.description")}
            />
            <FeatureCard
              icon="📲"
              title={t("whyChoose.justYourPhone.title")}
              description={t("whyChoose.justYourPhone.description")}
            />
            <FeatureCard
              icon="🎈"
              title={t("whyChoose.playYourWay.title")}
              description={t("whyChoose.playYourWay.description")}
            />
            <FeatureCard
              icon="🎉"
              title={t("whyChoose.builtForGroups.title")}
              description={t("whyChoose.builtForGroups.description")}
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("pricing.title")}
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            {t("pricing.subtitle")}
          </p>
          <div className="mt-10">
            <div className="inline-block rounded-card border border-gray-200 bg-white px-10 py-8 shadow-sm">
              <p className="text-sm font-medium text-gray-500 line-through">{t("pricing.originalPrice")}</p>
              <p className="mt-1 text-5xl font-bold tracking-tight text-gray-900">{t("pricing.price")}</p>
              <p className="mt-2 text-sm font-medium text-brand-600">{t("pricing.badge")}</p>
              <div className="mt-8">
                <CTAButton location="pricing" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("reviews.title")}
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <ReviewCard
              quote={t("reviews.0.quote")}
              name={t("reviews.0.name")}
            />
            <ReviewCard
              quote={t("reviews.1.quote")}
              name={t("reviews.1.name")}
            />
            <ReviewCard
              quote={t("reviews.2.quote")}
              name={t("reviews.2.name")}
            />
          </div>
        </div>
      </section>

      {/* 100% Fun Guarantee */}
      <section className="bg-brand-50 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-2xl font-bold text-brand-800">
            {t("guarantee.title")}
          </p>
          <p className="mt-3 text-lg text-brand-700">
            {t("guarantee.description")}
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {t("faqTitle")}
          </h2>
          <div className="mt-12">
            <FAQ />
          </div>
          <div className="mt-12 text-center">
            <CTAButton location="faq" />
          </div>
        </div>
      </section>
    </main>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
        {number}
      </div>
      <h3 className="mt-4 text-xl font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-card bg-gray-50 p-6">
      <span className="text-3xl">{icon}</span>
      <h3 className="mt-3 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function ReviewCard({ quote, name }: { quote: string; name: string }) {
  return (
    <div className="rounded-card bg-gray-50 p-6">
      <p className="text-gray-700 leading-relaxed">{"\u201C"}{quote}{"\u201D"}</p>
      <p className="mt-4 text-sm font-medium text-gray-900">{name}</p>
    </div>
  );
}
