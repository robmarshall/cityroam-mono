import { setRequestLocale } from "next-intl/server";
import { GiftSuccess } from "@/components/gift/GiftSuccess";

export default async function GiftSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { session_id } = await searchParams;
  const sessionId = (Array.isArray(session_id) ? session_id[0] : session_id)?.trim() || null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-20 sm:px-6 sm:py-24">
      <GiftSuccess sessionId={sessionId} />
    </main>
  );
}
