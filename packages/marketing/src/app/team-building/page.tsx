import type { Metadata } from "next";
import { CTAButton } from "@/components/CTAButton";

export const metadata: Metadata = {
  title: "Team Building — City Roam",
  description:
    "Get your team out of the office with an AI-guided treasure hunt in Leeds. Real collaboration, genuine problem-solving, and actual fun — perfect for teams of 4-10+.",
};

export default function TeamBuilding() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-24 text-center sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            Team Building Beyond the Boardroom
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
            Get your team out of the office and working together in a completely
            new environment. Real collaboration, genuine problem-solving, and
            actual fun.
          </p>
          <div className="mt-10">
            <CTAButton location="team-hero" label="Book Team Experience" />
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-xl leading-relaxed text-gray-700">
            <strong className="text-gray-900">
              Forget awkward icebreakers and forced trust falls.
            </strong>{" "}
            City Roam creates natural collaboration as your team works together
            to solve real challenges.
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            Watch colleagues who barely interact at work suddenly become
            problem-solving partners. See quiet team members shine as they crack
            crucial clues. Experience genuine teamwork away from emails and
            meetings.
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            Perfect for teams of 4&ndash;10 people. Larger groups? We recommend
            splitting into multiple teams for a friendly competition that brings
            everyone together.
          </p>
        </div>
      </section>

      {/* Why Companies Choose It */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Why Companies Choose City Roam
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <FeatureCard
              title="Real Collaboration"
              description="Teams must communicate, delegate, and combine different strengths to succeed. No forced activities \u2014 just natural teamwork that emerges organically."
            />
            <FeatureCard
              title="Fresh Perspective"
              description="Remove your team from their usual environment and watch new ideas emerge. Different setting, different thinking, better solutions."
            />
            <FeatureCard
              title="Inclusive for Everyone"
              description="No physical challenges or uncomfortable activities. Everyone can contribute regardless of fitness level, personality type, or experience."
            />
            <FeatureCard
              title="Energised Teams"
              description="Teams return to the office more connected and engaged. A shared experience that becomes a natural reference point for collaboration."
            />
          </div>
        </div>
      </section>

      {/* Perfect For */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Perfect For Your Team
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            Whether you&rsquo;re building new relationships or strengthening
            existing ones.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <IconCard
              icon="\ud83d\udc4b"
              title="New Team Integration"
              description="Help new hires connect with existing team members in a relaxed, natural setting. Break down barriers quickly."
            />
            <IconCard
              icon="\ud83d\udd17"
              title="Cross-Department Collaboration"
              description="Get different departments working together. Perfect for project kickoffs or breaking down workplace silos."
            />
            <IconCard
              icon="\ud83c\udfaf"
              title="Team Morale Boost"
              description="Reward your hardworking team with something genuinely fun. Show appreciation while building stronger relationships."
            />
          </div>
        </div>
      </section>

      {/* Team Sizes */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Flexible Team Sizes
          </h2>
          <div className="mx-auto mt-12 max-w-3xl grid gap-6 sm:grid-cols-2">
            <div className="rounded-card bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                4&ndash;10 People: The Sweet Spot
              </h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                Everyone can contribute meaningfully, communication flows
                naturally, and team dynamics emerge organically.
              </p>
            </div>
            <div className="rounded-card bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                11+ People: Multiple Teams
              </h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                Split into smaller teams for a friendly competition. Teams can
                start at different times or race against each other.
              </p>
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-3xl">
            <div className="rounded-card border border-brand-200 bg-brand-50 p-6 text-center">
              <h3 className="text-lg font-semibold text-brand-800">
                Multi-Team Competition
              </h3>
              <p className="mt-2 text-brand-700 leading-relaxed">
                Turn your team building into a company-wide event. Teams compete
                on the same route with bragging rights on the line. Contact us
                for multi-team pricing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Business Benefits */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Benefits You&rsquo;ll Actually See
          </h2>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {[
              { icon: "\ud83d\udcac", text: "Improved communication and active listening" },
              { icon: "\ud83d\udca1", text: "Enhanced creative problem-solving abilities" },
              { icon: "\ud83e\udd1d", text: "Stronger interpersonal relationships" },
              { icon: "\ud83d\udcc8", text: "Increased team confidence and morale" },
              { icon: "\u2b50", text: "Better understanding of individual strengths" },
              { icon: "\ud83c\udfaf", text: "Shared experience and inside references" },
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

      {/* Practical Business Info */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Practical Information
          </h2>
          <div className="mt-8 space-y-6 text-lg leading-relaxed text-gray-700">
            <p>
              We make corporate bookings simple. Book for your team with proper
              invoicing, expense-friendly pricing, and flexible scheduling that
              works around business needs.
            </p>
            <p>
              The experience takes 2&ndash;3 hours depending on pace, perfect
              for a morning or afternoon session. Teams can start any time
              between 9am&ndash;4pm, and we provide detailed briefing materials.
            </p>
            <p>
              All participants need is comfortable walking shoes and a
              smartphone. We handle everything else, including coordination for
              multiple teams and custom start times.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            What Companies Are Saying
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {[
              {
                quote:
                  "Best team building we\u2019ve done. Natural collaboration, everyone engaged, and actual problem-solving. The team came back energised and more connected.",
                name: "Sarah Mitchell, Marketing Director",
                company: "Tech Startup",
              },
              {
                quote:
                  "Perfect for our remote team\u2019s quarterly meetup. Gave people a chance to interact face-to-face in a relaxed setting. Much better than another conference room.",
                name: "James Parker, Engineering Manager",
                company: "Software Company",
              },
              {
                quote:
                  "We split our 16-person department into two teams. The friendly competition was brilliant, and everyone learned something new about their colleagues.",
                name: "Lisa Chen, Operations Lead",
                company: "Financial Services",
              },
              {
                quote:
                  "Easy to book, professional service, and genuine team building outcomes. We\u2019ll definitely be doing this again with new hires.",
                name: "Mark Thompson, HR Director",
                company: "Manufacturing",
              },
            ].map((item, i) => (
              <div key={i} className="rounded-card bg-white p-6 shadow-sm">
                <p className="text-gray-700 leading-relaxed italic">
                  &ldquo;{item.quote}&rdquo;
                </p>
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-900">
                    {item.name}
                  </p>
                  <p className="text-sm text-gray-500">{item.company}</p>
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
            Corporate Booking Questions
          </h2>
          <div className="mx-auto mt-12 max-w-2xl divide-y divide-gray-200">
            {[
              {
                q: "How do we book for a corporate team?",
                a: "Simple! Contact us with your preferred dates and team size. We\u2019ll handle invoicing, provide booking confirmations for expense claims, and coordinate timing that works for your schedule.",
              },
              {
                q: "What if we have more than 10 people?",
                a: "We recommend splitting into multiple teams of 4\u20136 people each. Teams can compete against each other or start at different times. We\u2019ll help coordinate multiple bookings and can provide leaderboards for the competitive element.",
              },
              {
                q: "What\u2019s the weather contingency plan?",
                a: "Teams can pause and resume another day if weather becomes an issue. We also offer full rescheduling for severe weather with no additional charges.",
              },
              {
                q: "Is there corporate pricing available?",
                a: "Yes, we offer competitive rates for corporate bookings and discounts for multiple teams. Contact us for a custom quote based on your requirements.",
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
            Real teamwork. Genuine collaboration. Get your team out of the
            office.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <CTAButton location="team-cta" label="Book Team Experience" />
            <a
              href="mailto:hello@cityroam.com"
              className="rounded-button border-2 border-white px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-white hover:text-brand-600"
            >
              Contact for Group Pricing
            </a>
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
