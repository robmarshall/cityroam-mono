/**
 * Shared layout building blocks for the marketing pages. Every page used to
 * carry its own copy of these (FeatureCard, IconCard, NumberedStep and the
 * section/heading class strings), which had drifted apart. Keep new sections
 * on these so spacing, type scale and card styling stay consistent.
 */

/**
 * Stone is the page itself; white lifts a band off it; navy is for the few
 * bands that close a page. `on-dark` flips the focus ring, and navy bands must
 * never carry brick text or buttons (2.93:1): use CTAButton `inverse`.
 */
type Tone = "stone" | "white" | "navy";

const TONE_CLASSES: Record<Tone, string> = {
  stone: "bg-stone-50",
  white: "bg-white",
  navy: "on-dark bg-ink-900 text-stone-50",
};

export function Section({
  tone = "stone",
  width = "wide",
  id,
  bookZone = false,
  className = "",
  children,
}: {
  tone?: Tone;
  width?: "wide" | "narrow";
  id?: string;
  /** Marks a booking section: the mobile booking bar hides while it's on screen. */
  bookZone?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-book-cta={bookZone ? "" : undefined}
      className={`${TONE_CLASSES[tone]} px-6 py-20 sm:py-24 ${className}`}
    >
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
      <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-ink-900 sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 text-lg leading-relaxed text-muted ${centred ? "mx-auto max-w-2xl" : ""}`}>
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
    <section className="bg-stone-50 px-6 py-20 text-center sm:py-28">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance text-ink-900 sm:text-6xl">
          {title}
        </h1>
        <p className="mt-6 text-lg leading-8 text-ink-700 sm:text-xl">{subtitle}</p>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

/** Three short paragraphs under the hero; the first may carry a bold lead-in. */
export function Intro({ children }: { children: React.ReactNode }) {
  return (
    <Section tone="white" width="narrow">
      <div className="space-y-6 text-lg leading-relaxed text-ink-700 sm:text-xl">{children}</div>
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
    <div className={`rounded-card bg-white p-6 ring-1 ring-stone-200 ${className}`}>
      <h3 className="font-display text-xl font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 leading-relaxed text-muted">{description}</p>
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
      className="mt-1 h-5 w-5 shrink-0 text-brick-500"
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

export function CheckList({
  items,
  columns = 2,
  className = "mt-12",
}: {
  items: string[];
  /** Columns from the sm breakpoint up. */
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <ul className={`grid gap-x-8 gap-y-4 ${columns === 2 ? "sm:grid-cols-2" : ""} ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-lg leading-relaxed text-ink-700">
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
              <h3 className="font-display text-xl font-semibold text-ink-900">{step.title}</h3>
              <p className="mt-1 leading-relaxed text-muted">{step.description}</p>
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
          <h3 className="mt-4 font-display text-xl font-semibold text-ink-900">{step.title}</h3>
          <p className="mt-2 leading-relaxed text-muted">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

function StepNumber({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-brick-500 font-display text-lg font-semibold text-brick-600 ${className}`}
    >
      {n}
    </span>
  );
}

/**
 * Closing call to action band at the foot of each audience page. Its id is
 * the target of the header's "Book now" on these pages, so the booking keeps
 * the page's segment.
 */
export function CtaBand({
  text,
  note,
  subnote,
  children,
}: {
  text: string;
  note?: string;
  subnote?: string;
  children: React.ReactNode;
}) {
  return (
    <Section id="book" bookZone tone="navy" width="narrow" className="scroll-mt-4 text-center">
      <p className="font-display text-2xl font-semibold leading-tight text-balance text-stone-50 sm:text-3xl">{text}</p>
      {note && <p className="mt-4 text-lg text-stone-200">{note}</p>}
      {subnote && <p className="mt-1 text-base text-stone-200">{subnote}</p>}
      <div className="mt-10">{children}</div>
    </Section>
  );
}
