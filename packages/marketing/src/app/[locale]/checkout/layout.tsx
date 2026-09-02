import type { Metadata } from "next";

/**
 * The checkout result reads `session_id` from the query string and polls the
 * API, so it must stay server-rendered on demand rather than being prerendered
 * by the locale-level `generateStaticParams`. It is also a private,
 * one-time-use page, so it is kept out of search results.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
