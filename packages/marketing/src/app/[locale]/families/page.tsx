import type { Metadata } from "next";
import { CTAButton } from "@/components/CTAButton";

export const metadata: Metadata = {
  title: "Family Adventures — City Roam",
  description:
    "Turn your family day out into an exciting AI-guided treasure hunt in Leeds. Suitable for all ages, pushchair friendly, and designed to keep everyone entertained.",
};

export default function Families() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-24 text-center sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Family Adventures Made Easy
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
            Turn your family day out into an exciting treasure hunt. Perfect for
            creating memories that last a lifetime &mdash; and keeping everyone
            entertained.
          </p>
          <div className="mt-10">
            <CTAButton location="families-hero" label="Book Family Adventure" />
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-xl leading-relaxed text-gray-700">
            <strong className="text-gray-900">
              Tired of hearing &ldquo;Are we there yet?&rdquo;
            </strong>{" "}
            City Roam turns your family walk into an adventure that keeps
            everyone engaged.
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            No more dragging reluctant kids around tourist spots. Instead, watch
            them race ahead to solve the next clue while discovering amazing
            places and stories about the city.
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            Designed to work for mixed ages &mdash; from curious 8-year-olds to
            teenagers and grandparents. Everyone contributes, everyone learns,
            everyone has fun.
          </p>
        </div>
      </section>

      {/* Why Families Love It */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Why Families Love City Roam
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <FeatureCard
              title="Keeps Everyone Engaged"
              description="No more bored kids or dragged feet. The clues and challenges keep minds active and feet moving willingly."
            />
            <FeatureCard
              title="Educational & Fun"
              description="Learn about history, architecture, and local culture without feeling like a school trip. Knowledge comes naturally through play."
            />
            <FeatureCard
              title="Works for All Ages"
              description="From 8 to 80 — everyone can contribute. Younger kids solve visual clues, teens help with directions, adults share stories."
            />
            <FeatureCard
              title="Real Family Bonding"
              description="Put phones away (except for the game!) and work together as a team. Create memories while exploring together."
            />
          </div>
        </div>
      </section>

      {/* Perfect For */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Perfect For Every Family
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            Whether you&rsquo;re locals wanting to see your city differently or
            visitors exploring somewhere new.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <IconCard
              icon="\ud83d\udc74\ud83d\udc75"
              title="Visiting Grandparents"
              description="Show them around in a fun, interactive way. They'll love the stories and history, while the kids love the adventure."
            />
            <IconCard
              icon="\u2600\ufe0f"
              title="Weekend Family Time"
              description="Turn a regular Saturday into something special. Get out, get moving, and discover parts of your own city you never knew existed."
            />
            <IconCard
              icon="\ud83c\udf92"
              title="School Holidays"
              description="Beat the holiday boredom with an educational adventure. It's learning disguised as play — and they'll never notice."
            />
          </div>
        </div>
      </section>

      {/* How It Works for Families */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            How Your Family Adventure Works
          </h2>
          <div className="mx-auto mt-12 max-w-2xl space-y-8">
            <NumberedStep
              number="1"
              title="Start When Ready"
              description="No rushing to meet a tour group. Begin when everyone's fed, watered, and ready to explore."
            />
            <NumberedStep
              number="2"
              title="Work as a Team"
              description="Let different family members take the lead on different clues. Everyone gets to be the hero."
            />
            <NumberedStep
              number="3"
              title="Take Your Time"
              description="Stop for ice cream, let the kids run around, or just enjoy a moment. The adventure waits for you."
            />
          </div>
        </div>
      </section>

      {/* Family-Friendly Features */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Family-Friendly Features
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            Everything designed with real families in mind &mdash; because we
            know how family outings actually work.
          </p>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {[
              { icon: "\u267f", text: "Pushchair and wheelchair accessible route" },
              { icon: "\ud83e\udde9", text: "Clues suitable for ages 8+ (younger with help)" },
              { icon: "\u2615", text: "Plenty of places to stop for snacks and toilet breaks" },
              { icon: "\ud83d\udcd6", text: "Educational content that doesn't feel like homework" },
              { icon: "\ud83d\udc15", text: "Dog-friendly route for family pets" },
              { icon: "\u23f8\ufe0f", text: "Pause and resume \u2014 perfect for attention spans" },
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-4 rounded-card bg-white p-4 shadow-sm"
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-gray-700 leading-relaxed">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Safety & Practical */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Safety & Practical Information
          </h2>
          <div className="mt-8 space-y-6 text-lg leading-relaxed text-gray-700">
            <p>
              We know safety comes first when you&rsquo;re out with family. The
              route stays in busy, well-lit areas with plenty of shops and cafes
              nearby.
            </p>
            <p>
              Routes are around 2.5 miles and generally flat &mdash; perfect for
              little legs and pushchairs. There are family-friendly stops along
              the way.
            </p>
            <p>
              If the weather turns or someone gets tired, you can pause the game
              and pick it up another day. No pressure, just pure family fun.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Family Questions Answered
          </h2>
          <div className="mx-auto mt-12 max-w-2xl divide-y divide-gray-200">
            {[
              {
                q: "What ages is this suitable for?",
                a: "Kids aged 8+ can actively participate in solving clues. Younger children (4\u20137) can join in with help from older family members and will enjoy spotting things and being part of the adventure. It\u2019s designed to work for mixed-age groups.",
              },
              {
                q: "Is it pushchair friendly?",
                a: "Absolutely! The entire route is pushchair and wheelchair accessible. We\u2019ve specifically chosen paths that work for families with buggies, avoiding steps and steep hills.",
              },
              {
                q: "How long does it take with kids?",
                a: "Most families take 2.5\u20133.5 hours, but there\u2019s no rush! Build in time for snack breaks, toilet stops, and those moments when kids want to explore something interesting. You can pause whenever needed.",
              },
              {
                q: "What if it rains or kids get tired?",
                a: "You can pause your adventure at any point and resume later \u2014 even on a different day! There are plenty of indoor spots to shelter, and the game saves your progress automatically.",
              },
              {
                q: "Are there places to stop for food?",
                a: "Yes! The route passes family-friendly cafes, pubs with kids\u2019 menus, and spots perfect for picnics. We include recommendations for the best family stops along the way.",
              },
              {
                q: "Do kids need their own phones?",
                a: "No, one phone per family is perfect. In fact, it encourages teamwork as everyone gathers around to solve clues together. Much better than everyone staring at separate screens!",
              },
            ].map((item, i) => (
              <div key={i} className="py-5">
                <h3 className="text-lg font-medium text-gray-900">{item.q}</h3>
                <p className="mt-2 text-gray-600 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-500 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-2xl font-bold leading-tight text-white sm:text-3xl">
            Adventure the whole family will love. Learning disguised as play.
            Memories that last forever.
          </p>
          <div className="mt-10">
            <CTAButton location="families-cta" label="Book Family Adventure" />
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
          <p className="mt-2">&copy; {new Date().getFullYear()} City Roam. All rights reserved.</p>
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
