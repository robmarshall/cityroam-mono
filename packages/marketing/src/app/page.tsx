import { CTAButton } from "@/components/CTAButton";
import { FAQ } from "@/components/FAQ";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-24 text-center sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            AI-Guided Treasure Hunts in Leeds
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
            Solve clues, discover hidden gems, and explore the city with friends
            &mdash; all guided by AI on your phone.
          </p>
          <div className="mt-10">
            <CTAButton location="hero" />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            How It Works
          </h2>
          <div className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-8">
            <Step
              number="1"
              title="Book"
              description="Book for your group. You'll get a unique link to share."
            />
            <Step
              number="2"
              title="Share the Link"
              description="Send it to your friends. Everyone opens it on their phone and joins."
            />
            <Step
              number="3"
              title="Explore"
              description="Follow clues through the city, chat with your AI guide, and discover Leeds together."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Simple Pricing
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            One price for the whole group. Up to 10 people.
          </p>
          <div className="mt-10">
            <div className="inline-block rounded-card border border-gray-200 bg-white px-10 py-8 shadow-sm">
              <p className="text-sm font-medium text-gray-500 line-through">£49</p>
              <p className="mt-1 text-5xl font-bold tracking-tight text-gray-900">£29</p>
              <p className="mt-2 text-sm font-medium text-brand-600">Launch pricing</p>
              <div className="mt-8">
                <CTAButton location="pricing" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
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

      {/* Refund Policy */}
      <section className="bg-brand-50 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xl font-semibold text-brand-800">
            Not happy? Get a full refund, no questions asked.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12">
        <div className="mx-auto max-w-5xl text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} City Roam. All rights reserved.</p>
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

function ReviewCard({ quote, name }: { quote: string; name: string }) {
  return (
    <div className="rounded-card bg-white p-6 shadow-sm">
      <p className="text-gray-700 leading-relaxed">&ldquo;{quote}&rdquo;</p>
      <p className="mt-4 text-sm font-medium text-gray-900">{name}</p>
    </div>
  );
}
