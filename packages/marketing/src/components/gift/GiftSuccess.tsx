"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { VoucherCheckoutSuccessResponse } from "@cityroam/shared/types";
import { Link } from "@/i18n/navigation";
import { CONTACT_EMAIL, LINK_VALID_DAYS } from "@/lib/site";
import { fetchVoucherSuccess, pollDelay } from "./voucher-api";
import { CopyButton, CopyField, useFocusOnChange } from "./ui";
import {
  formatDate,
  linkClass,
  secondaryButtonClass,
} from "./styles";

/** How long to keep asking before saying the email is on its way. */
export const MAX_POLL_MS = 30_000;

type State =
  | { kind: "loading" }
  | { kind: "ready"; voucher: VoucherCheckoutSuccessResponse }
  | { kind: "pending" };

/**
 * After Stripe: waits for the webhook to create the voucher (the API answers
 * 404 VOUCHER_NOT_FOUND until then), backing off between tries, and shows
 * the code. After about 30 seconds it stops and says the email is coming,
 * which it is: the webhook sends it whenever it lands.
 */
export function GiftSuccess({ sessionId }: { sessionId: string | null }) {
  const [state, setState] = useState<State>(sessionId ? { kind: "loading" } : { kind: "pending" });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const run = useRef(0);
  const headingRef = useFocusOnChange<HTMLHeadingElement>(state.kind);

  const poll = useCallback(() => {
    if (!sessionId) return;
    clearTimeout(timer.current);
    const thisRun = ++run.current;
    const started = Date.now();

    const attempt = async (n: number) => {
      const result = await fetchVoucherSuccess(sessionId);
      if (thisRun !== run.current) return;
      if (result.ok && result.data?.voucher_code) {
        setState({ kind: "ready", voucher: result.data });
        return;
      }
      // 400 (no such session id) will never turn into a voucher.
      const hopeless = !result.ok && result.status === 400;
      const delay = pollDelay(n);
      if (hopeless || Date.now() - started + delay > MAX_POLL_MS) {
        setState({ kind: "pending" });
        return;
      }
      timer.current = setTimeout(() => attempt(n + 1), delay);
    };

    setState({ kind: "loading" });
    void attempt(0);
  }, [sessionId]);

  useEffect(() => {
    poll();
    return () => {
      run.current++;
      clearTimeout(timer.current);
    };
  }, [poll]);

  return (
    <div className="mx-auto w-full max-w-lg">
      {state.kind === "loading" && <Loading />}
      {state.kind === "ready" && <Ready voucher={state.voucher} headingRef={headingRef} />}
      {state.kind === "pending" && (
        <Pending headingRef={headingRef} onRetry={sessionId ? poll : undefined} />
      )}
    </div>
  );
}

function Loading() {
  const t = useTranslations("gift.success");
  return (
    <div role="status" className="text-center">
      <div
        aria-hidden="true"
        className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-brick-500 motion-reduce:animate-none"
      />
      <p className="mt-6 text-lg text-muted">{t("loading")}</p>
    </div>
  );
}

function Ready({
  voucher,
  headingRef,
}: {
  voucher: VoucherCheckoutSuccessResponse;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const t = useTranslations("gift.success");
  const locale = useLocale();

  return (
    <div className="text-center">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-3xl font-semibold text-ink-900 focus:outline-none sm:text-4xl"
      >
        {t("title")}
      </h1>

      <div className="mt-8 rounded-card bg-white px-6 py-8 ring-1 ring-stone-200">
        <p className="text-sm font-medium text-muted">{t("codeLabel")}</p>
        <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.12em] break-all text-ink-900 sm:text-4xl">
          {voucher.voucher_code}
        </p>
        <p className="mt-3 text-ink-700">
          {t("redeemBy", { date: formatDate(locale, voucher.expires_at) })}
        </p>
        <div className="mt-5">
          <CopyButton text={voucher.voucher_code} label={t("copyCode")} copiedLabel={t("copied")} />
        </div>
        <div className="mt-8 text-left">
          <CopyField
            id="gift-redeem-link"
            label={t("linkLabel")}
            value={voucher.redeem_url}
            copyLabel={t("copyLink")}
            copiedLabel={t("copied")}
          />
        </div>
      </div>

      <p className="mt-6 text-ink-700">{t("emailed")}</p>

      <div className="mt-8 rounded-card bg-stone-100 p-6 text-left">
        <h2 className="font-semibold text-ink-900">{t("nextTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t("nextText", { days: LINK_VALID_DAYS })}
        </p>
      </div>
    </div>
  );
}

function Pending({
  headingRef,
  onRetry,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRetry?: () => void;
}) {
  const t = useTranslations("gift.success.pending");
  return (
    <div className="text-center">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-3xl font-semibold text-ink-900 focus:outline-none"
      >
        {t("title")}
      </h1>
      <p className="mt-4 leading-relaxed text-ink-700">{t("text")}</p>
      <p className="mt-4 leading-relaxed text-muted">
        {t("help", { email: CONTACT_EMAIL })}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        {onRetry && (
          <button type="button" onClick={onRetry} className={secondaryButtonClass}>
            {t("checkAgain")}
          </button>
        )}
        <Link href="/" className={linkClass}>
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
