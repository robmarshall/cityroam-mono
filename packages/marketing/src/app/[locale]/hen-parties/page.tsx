import type { Metadata } from "next";
import { CTAButton } from "@/components/CTAButton";

export const metadata: Metadata = {
  title: "Hen Party Adventures — City Roam",
  description:
    "Give the bride-to-be an unforgettable experience. Explore Leeds together, solve clues as a team, and create memories that last long after the wedding.",
};

export default function HenParties() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="px-6 py-24 text-center sm:py-32">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            The Perfect Hen Do Adventure
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 sm:text-xl">
            Give the bride-to-be an unforgettable experience. Explore the city
            together, solve clues as a team, and create memories that&rsquo;ll
            last long after the wedding.
          </p>
          <div className="mt-10">
            <CTAButton location="hen-hero" label="Book Hen Party Adventure" />
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-xl leading-relaxed text-gray-700">
            <strong className="text-gray-900">
              Skip the same old hen party activities.
            </strong>{" "}
            City Roam offers something completely different &mdash; an adventure
            that brings everyone together while celebrating the bride.
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            Perfect for groups who want something unique, memorable, and
            Instagram-worthy. No awkward games or forced fun &mdash; just
            genuine excitement as you explore the city and solve challenges
            together.
          </p>
          <p className="mt-6 text-xl leading-relaxed text-gray-700">
            Ideal for groups of 6&ndash;12 friends. Everyone gets involved,
            bonds form naturally, and the bride gets an experience she&rsquo;ll
            treasure forever.
          </p>
        </div>
      </section>

      {/* Why Hen Parties Love It */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Why Hen Parties Love City Roam
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            <FeatureCard
              title="Something Totally Different"
              description="Stand out from the typical hen do crowd. Give the bride an experience she's never had before \u2014 and probably never will again!"
            />
            <FeatureCard
              title="Perfect Group Activity"
              description="Everyone works together towards a common goal. Great icebreaker for friends who don't know each other well, and brilliant bonding for old friends."
            />
            <FeatureCard
              title="Instagram-Worthy Moments"
              description="Discover hidden gems and beautiful spots perfect for those all-important hen party photos. Content as unique as your friendship."
            />
            <FeatureCard
              title="Celebration-Friendly Timing"
              description="Fits perfectly around your other plans. Do it as a daytime activity before evening celebrations, or as a fun start to the weekend."
            />
          </div>
        </div>
      </section>

      {/* Perfect For Every Style */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Perfect For Every Style of Hen Do
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-gray-600">
            Whether you&rsquo;re planning a low-key celebration or a
            weekend-long extravaganza.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <IconCard
              icon="\u2600\ufe0f"
              title="Daytime Adventures"
              description="Perfect start to your hen weekend. Get everyone together, break the ice, and work up an appetite for your evening celebrations."
            />
            <IconCard
              icon="\u2728"
              title="Alternative Celebrations"
              description="For brides who want something different from the usual hen party scene. Unique, memorable, and totally personalized to your group."
            />
            <IconCard
              icon="\ud83d\udc95"
              title="Mixed Groups"
              description="Brilliant when you have friends from different parts of life who don't know each other. Everyone bonds over solving clues together."
            />
          </div>
        </div>
      </section>

      {/* Easy Coordination */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Easy to Organise
          </h2>
          <div className="mx-auto mt-12 max-w-3xl grid gap-6 sm:grid-cols-2">
            <div className="rounded-card bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                6&ndash;12 People: Perfect Size
              </h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                Everyone stays together, can hear each other, and no one gets
                left behind. Perfect for group photos too.
              </p>
            </div>
            <div className="rounded-card bg-gray-50 p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Super Simple to Book
              </h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                One booking, one payment, one confirmation. Share the details
                with the group and you&rsquo;re done. No complex coordination
                needed.
              </p>
            </div>
          </div>
          <div className="mx-auto mt-6 max-w-3xl">
            <div className="rounded-card border border-brand-200 bg-brand-50 p-6 text-center">
              <h3 className="text-lg font-semibold text-brand-800">
                Make the Bride Feel Special
              </h3>
              <p className="mt-2 text-brand-700 leading-relaxed">
                She&rsquo;ll love that you chose something unique and
                thoughtful. An experience that celebrates her while bringing all
                her favourite people together.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What Makes It Special */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            What Makes It Special
          </h2>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {[
              { icon: "\ud83d\udcf7", text: "Amazing photo opportunities at hidden gems" },
              { icon: "\ud83e\udd1d", text: "Teamwork that brings the group together" },
              { icon: "\u23f0", text: "Flexible timing around your other celebrations" },
              { icon: "\ud83d\udc96", text: "Unique experience the bride will never forget" },
              { icon: "\ud83e\udd42", text: "Great pubs and bars discovered along the route" },
              { icon: "\ud83d\udccb", text: "Easy for the organiser to coordinate" },
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

      {/* Practical Info */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Celebrating Safely
          </h2>
          <div className="mt-8 space-y-6 text-lg leading-relaxed text-gray-700">
            <p>
              The route stays in busy, well-lit areas with plenty of pubs,
              cafes, and shops along the way.
            </p>
            <p>
              Start any time that suits your weekend schedule &mdash; morning
              adventures before evening celebrations, or afternoon activities
              that flow into dinner and drinks.
            </p>
            <p>
              Groups stick together naturally as you solve clues, and
              there&rsquo;s plenty of opportunity for those all-important hen
              party photos. Plus, you&rsquo;ll discover great spots for your
              evening celebrations.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-gray-50 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            What Brides & Their Friends Say
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {[
              {
                quote:
                  "Best hen party activity ever! So different from the usual, and everyone loved it. The bride was absolutely glowing \u2014 perfect start to our weekend.",
                name: "Lucy, Maid of Honour",
                occasion: "Weekend Hen Do",
              },
              {
                quote:
                  "Brilliant icebreaker for our mixed group. Friends from uni, work, and home all bonded over solving clues. Such a clever way to bring everyone together.",
                name: "Sophie, Bride-to-be",
                occasion: "Day Celebration",
              },
              {
                quote:
                  "Perfect timing for our hen weekend. Did this on Saturday afternoon, discovered amazing spots, then went to some of the pubs we\u2019d found for evening drinks!",
                name: "Emma, Bridesmaid",
                occasion: "Hen Weekend",
              },
              {
                quote:
                  "So easy to organise and everyone raved about it. The bride said it was her favourite part of the whole hen do. Couldn\u2019t have asked for more!",
                name: "Kate, Sister of Bride",
                occasion: "Celebration Day",
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
                  <p className="text-sm text-gray-500">{item.occasion}</p>
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
            Hen Party Planning Questions
          </h2>
          <div className="mx-auto mt-12 max-w-2xl divide-y divide-gray-200">
            {[
              {
                q: "How do we make it special for the bride?",
                a: "The bride naturally becomes the centre of attention as the group works together. Everyone\u2019s focused on creating a great experience for her, and she gets to be part of something unique and memorable.",
              },
              {
                q: "What time should we start?",
                a: "Totally flexible! Morning starts work great before lunch and evening celebrations. Afternoon adventures can flow perfectly into dinner and drinks. We recommend starting between 10am\u20133pm for best timing.",
              },
              {
                q: "Can we take photos during the experience?",
                a: "Absolutely! You\u2019ll discover beautiful, hidden spots perfect for hen party photos. The route includes some of the most Instagram-worthy locations in the city.",
              },
              {
                q: "Can we have a drink during the adventure?",
                a: "You\u2019ll pass plenty of gorgeous pubs and bars along the route. Many groups stop for a celebratory drink partway through!",
              },
              {
                q: "What if some people don't know each other?",
                a: "This is actually one of the best icebreakers ever. Working together on clues gets everyone talking and laughing naturally. Much better than awkward introductions over dinner.",
              },
              {
                q: "What if the weather's not great?",
                a: "You can pause the adventure and resume later, or even continue another day. There are plenty of covered areas and indoor spots to duck into. Don\u2019t let British weather stop the celebration!",
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
            Give the bride something unforgettable. Create memories together.
            Start her wedding celebrations perfectly.
          </p>
          <div className="mt-10">
            <CTAButton location="hen-cta" label="Book Hen Party Adventure" />
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
