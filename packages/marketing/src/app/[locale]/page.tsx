import { CTAButton } from "@/components/CTAButton";
import { FAQ } from "@/components/FAQ";
import IphoneDemo from "@/components/IphoneDemo/IphoneDemo";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-24 sm:py-32 overflow-hidden">
        <div className="mx-auto max-w-5xl flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
          <div className="flex-1 text-center lg:text-left">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              AI-Guided Treasure Hunts in Leeds
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
              Solve clues, discover hidden gems, and explore the city with
              friends &mdash; all guided by AI on your phone.
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
            <strong className="text-gray-900">No schedules. No guides.</strong>{" "}
            Just your group, your phone, and a trail of clues.
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            City Roam is a phone-based exploration game that takes you through
            the heart of Leeds. No app to download. Just clues, discoveries, and
            good times.
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            Solve riddles, uncover hidden stories, and explore at your own pace.
            Whether you&rsquo;re with family, friends, or colleagues &mdash;
            it&rsquo;s made to be shared.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            How It Works
          </h2>
          <div className="mt-16 grid gap-12 sm:grid-cols-2 sm:gap-8">
            <Step
              number="1"
              title="Start in the City"
              description="Choose your starting point and hit go when you're ready. Begin your adventure from anywhere in the city centre."
            />
            <Step
              number="2"
              title="Solve Clues Together"
              description="Use your phone to crack creative clues that lead you around town. Each puzzle brings you closer to hidden gems."
            />
            <Step
              number="3"
              title="Discover Hidden Stories"
              description="Learn about secret spots, local legends, and fascinating history as you explore. See Leeds with fresh eyes."
            />
            <Step
              number="4"
              title="Play at Your Pace"
              description="Stop for drinks, lunch, or even pick it back up another day. There are no time limits — it's your adventure."
            />
          </div>
        </div>
      </section>

      {/* Just Your Phone */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl flex flex-col items-center gap-12 md:flex-row md:gap-16">
          <div className="flex-1 order-2 md:order-1">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Just Take Your Phone
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">
              No app to download. No equipment to carry. Just open your
              phone&rsquo;s browser and start exploring.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                { icon: "\ud83d\udcf1", text: "Works on any smartphone" },
                { icon: "\u2601\ufe0f", text: "No downloads \u2014 runs in your browser" },
                { icon: "\ud83d\udcac", text: "Chat-based AI guide walks you through" },
                { icon: "\u23f8\ufe0f", text: "Pause and resume whenever you like" },
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-gray-700">
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-lg">{item.text}</span>
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
            What&rsquo;s Included
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            Everything you need for a brilliant day out &mdash; just bring your
            sense of adventure.
          </p>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {[
              { icon: "\ud83d\uddfa\ufe0f", text: "A hand-crafted route through Leeds (~2.5 miles)" },
              { icon: "\ud83e\udde9", text: "Interactive clues, riddles & mini challenges" },
              { icon: "\ud83c\udf7b", text: "Local food & drink tips throughout the game" },
              { icon: "\ud83d\udcf1", text: "No downloads \u2014 just use your phone\u2019s browser" },
              { icon: "\u23f8\ufe0f", text: "Pause and resume whenever you like" },
              { icon: "\u267f", text: "Pushchair, wheelchair & dog friendly" },
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

      {/* Why Choose City Roam */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Why Choose City Roam?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            Flexible, fun, and full of surprises. Not your average city tour.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <FeatureCard
              icon="\ud83d\udcda"
              title="Local Knowledge"
              description="Designed by locals to showcase the stories and hidden spots we love \u2014 no cookie-cutter sightseeing."
            />
            <FeatureCard
              icon="\ud83d\udcf2"
              title="Just Your Phone"
              description="Works straight from your browser. No apps. No downloads. No tech stress."
            />
            <FeatureCard
              icon="\ud83c\udf88"
              title="Play Your Way"
              description="Start when you want. Stop for coffee. Pick up tomorrow. You\u2019re in charge."
            />
            <FeatureCard
              icon="\ud83c\udf89"
              title="Built for Groups"
              description="Whether you\u2019re with mates, family, or colleagues \u2014 it\u2019s great for groups."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Simple Pricing
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            One price for the whole group. Up to 10 people.
          </p>
          <div className="mt-10">
            <div className="inline-block rounded-card border border-gray-200 bg-white px-10 py-8 shadow-sm">
              <p className="text-sm font-medium text-gray-500 line-through">&pound;49</p>
              <p className="mt-1 text-5xl font-bold tracking-tight text-gray-900">&pound;29</p>
              <p className="mt-2 text-sm font-medium text-brand-600">Launch pricing</p>
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
            What People Say
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <ReviewCard
              quote="Such a fun afternoon! The AI guide was surprisingly witty."
              name="Sarah T."
            />
            <ReviewCard
              quote="Perfect for a birthday outing. Everyone loved solving the clues together."
              name="James M."
            />
            <ReviewCard
              quote="Way better than a boring walking tour. We discovered places we never knew existed!"
              name="Priya K."
            />
          </div>
        </div>
      </section>

      {/* 100% Fun Guarantee */}
      <section className="bg-brand-50 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-2xl font-bold text-brand-800">
            100% Fun Guarantee
          </p>
          <p className="mt-3 text-lg text-brand-700">
            Didn&rsquo;t have fun? We&rsquo;ll refund you. No questions asked.
            We want everyone to enjoy exploring with City Roam.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <div className="mt-12">
            <FAQ />
          </div>
          <div className="mt-12 text-center">
            <CTAButton location="faq" />
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
      <p className="text-gray-700 leading-relaxed">&ldquo;{quote}&rdquo;</p>
      <p className="mt-4 text-sm font-medium text-gray-900">{name}</p>
    </div>
  );
}
