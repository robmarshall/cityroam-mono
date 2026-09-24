/**
 * Shared layout building blocks for the marketing pages. Every page used to
 * carry its own copy of these (FeatureCard, IconCard, NumberedStep and the
 * section/heading class strings), which had drifted apart. Keep new sections
 * on these so spacing, type scale and card styling stay consistent.
 */

type Tone = "white" | "muted" | "brand";

const TONE_CLASSES: Record<Tone, string> = {
  white: "bg-white",
  muted: "bg-gray-50",
  brand: "bg-brand-600",
};

export function Section({
  tone = "white",
  width = "wide",
  id,
  className = "",
  children,
}: {
  tone?: Tone;
  width?: "wide" | "narrow";
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`${TONE_CLASSES[tone]} px-6 py-20 sm:py-24 ${className}`}>
      <div className={`mx-auto ${width === "wide" ? "max-w-5xl" : "max-w-3xl"}`}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  title,
  subtitle,
  align = "center",
}: {
  title: string;
  subtitle?: string;
  align?: "center" | "left";
}) {
  const centred = align === "center";
  return (
    <div className={centred ? "text-center" : undefined}>
      <h2 className="text-3xl font-bold tracking-tight text-balance text-gray-900 sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 text-lg leading-relaxed text-gray-600 ${centred ? "mx-auto max-w-2xl" : ""}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** Page hero for the audience pages. The homepage hero has its own layout. */
export function PageHero({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white px-6 py-20 text-center sm:py-28">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-gray-900 sm:text-6xl">
          {title}
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">{subtitle}</p>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Three short paragraphs under the hero; the first may carry a bold lead-in. */
export function Intro({ children }: { children: React.ReactNode }) {
  return (
    <Section tone="muted" width="narrow">
      <div className="space-y-6 text-lg leading-relaxed text-gray-700 sm:text-xl">{children}</div>
    </Section>
  );
}

export function Card({
  title,
  description,
  className = "",
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`rounded-card bg-white p-6 ring-1 ring-gray-200 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 leading-relaxed text-gray-600">{description}</p>
    </div>
  );
}

export function CardGrid({
  columns = 2,
  children,
}: {
  columns?: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <div className={`mt-12 grid gap-6 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {children}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CheckList({ items, className = "mt-12" }: { items: string[]; className?: string }) {
  return (
    <ul className={`grid gap-x-8 gap-y-4 sm:grid-cols-2 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-lg leading-relaxed text-gray-700">
          <CheckIcon />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({
  steps,
  layout = "grid",
}: {
  steps: { title: string; description: string }[];
  layout?: "grid" | "list";
}) {
  if (layout === "list") {
    return (
      <ol className="mx-auto mt-12 max-w-2xl space-y-8">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <StepNumber n={i + 1} />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-1 leading-relaxed text-gray-600">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
      {steps.map((step, i) => (
        <li key={step.title} className="text-center">
          <StepNumber n={i + 1} className="mx-auto" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">{step.title}</h3>
          <p className="mt-2 leading-relaxed text-gray-600">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

function StepNumber({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white ${className}`}
    >
      {n}
    </span>
  );
}

/** Closing call to action band at the foot of each audience page. */
export function CtaBand({
  text,
  note,
  children,
}: {
  text: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Section tone="brand" width="narrow" className="text-center">
      <p className="text-2xl font-bold leading-tight text-balance text-white sm:text-3xl">{text}</p>
      {note && <p className="mt-4 text-lg text-brand-50">{note}</p>}
      <div className="mt-10">{children}</div>
    </Section>
  );
}
