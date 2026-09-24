"use client";

import { useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SupportedLanguage } from "@cityroam/shared/types";
import {
  VOUCHER_MESSAGE_MAX_LENGTH,
  VOUCHER_RECIPIENT_NAME_MAX_LENGTH,
} from "@cityroam/shared/constants";
import { CONTACT_EMAIL, MAX_PARTICIPANTS, PRICE_GBP, formatGBP } from "@/lib/site";
import { createVoucherSession, isNoHuntAvailable } from "./voucher-api";
import {
  hintClass,
  inputClass,
  labelClass,
  primaryButtonClass,
} from "./styles";

type FormError = "noHunt" | "invalid" | "generic";

/**
 * The gift purchase form: optional recipient name and message (both printed
 * on the card), then Stripe Checkout. Nothing is saved until the buyer pays;
 * the fields only travel to Stripe as session metadata.
 */
export function GiftForm() {
  const t = useTranslations("gift.page.form");
  const tl = useTranslations("gift.languages");
  const locale = useLocale() as SupportedLanguage;
  const id = useId();

  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const busy = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // One line only: pasted line breaks become spaces.
  const cleanName = (v: string) => v.replace(/[\r\n]+/g, " ");

  const nameTooLong = name.trim().length > VOUCHER_RECIPIENT_NAME_MAX_LENGTH;
  const messageTooLong = message.trim().length > VOUCHER_MESSAGE_MAX_LENGTH;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current || nameTooLong || messageTooLong) return;
    busy.current = true;
    setLoading(true);
    setError(null);

    const result = await createVoucherSession({
      language: locale,
      recipientName: name,
      message,
    });

    if (result.ok && result.data?.url) {
      // Leave `busy` set: the page is navigating away.
      window.location.href = result.data.url;
      return;
    }

    busy.current = false;
    setLoading(false);
    setError(
      !result.ok && isNoHuntAvailable(result)
        ? "noHunt"
        : !result.ok && result.code === "INVALID_INPUT"
          ? "invalid"
          : "generic",
    );
    // Let the alert render, then take focus to it.
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  const nameId = `${id}-name`;
  const messageId = `${id}-message`;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-card bg-stone-50 px-6 py-8 ring-1 ring-stone-200 sm:px-8"
    >
      <h2 className="font-display text-2xl font-semibold text-ink-900">{t("title")}</h2>
      <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink-900">
        {formatGBP(PRICE_GBP)}
        <span className="ml-2 font-sans text-base font-medium tracking-normal text-muted">
          {t("perGroup", { max: MAX_PARTICIPANTS })}
        </span>
      </p>

      <div className="mt-8 space-y-6">
        <Field
          id={nameId}
          label={t("nameLabel")}
          optional={t("optional")}
          hint={t("nameHint")}
          count={name.trim().length}
          max={VOUCHER_RECIPIENT_NAME_MAX_LENGTH}
          tooLong={nameTooLong ? t("nameTooLong", { max: VOUCHER_RECIPIENT_NAME_MAX_LENGTH }) : null}
          counterLabel={(count, max) => t("counter", { count, max })}
        >
          {(describedBy) => (
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(cleanName(e.target.value))}
              autoComplete="off"
              maxLength={VOUCHER_RECIPIENT_NAME_MAX_LENGTH + 20}
              aria-describedby={describedBy}
              aria-invalid={nameTooLong || undefined}
              disabled={loading}
              className={`mt-2 ${inputClass}`}
            />
          )}
        </Field>

        <Field
          id={messageId}
          label={t("messageLabel")}
          optional={t("optional")}
          hint={t("messageHint")}
          count={message.trim().length}
          max={VOUCHER_MESSAGE_MAX_LENGTH}
          tooLong={messageTooLong ? t("messageTooLong", { max: VOUCHER_MESSAGE_MAX_LENGTH }) : null}
          counterLabel={(count, max) => t("counter", { count, max })}
        >
          {(describedBy) => (
            <textarea
              id={messageId}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={VOUCHER_MESSAGE_MAX_LENGTH + 50}
              aria-describedby={describedBy}
              aria-invalid={messageTooLong || undefined}
              disabled={loading}
              className={`mt-2 resize-y ${inputClass}`}
            />
          )}
        </Field>
      </div>

      <p className="mt-6 text-sm text-ink-700">{t("languageNote", { language: tl(locale) })}</p>

      <div className="mt-6">
        <button
          type="submit"
          disabled={loading || nameTooLong || messageTooLong}
          aria-busy={loading}
          className={`w-full ${primaryButtonClass}`}
        >
          {loading ? t("loading") : t("submit")}
        </button>
      </div>

      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-4 text-sm text-red-700 focus:outline-none"
        >
          {t(`errors.${error}`, { email: CONTACT_EMAIL })}
        </p>
      )}

      <p className="mt-4 text-center text-sm text-muted">{t("secure")}</p>
    </form>
  );
}

/**
 * A labelled field with a hint and a character counter. The counter is read
 * out politely only when it gets close to the limit, so screen reader users
 * aren't told the count on every keystroke.
 */
function Field({
  id,
  label,
  optional,
  hint,
  count,
  max,
  tooLong,
  counterLabel,
  children,
}: {
  id: string;
  label: string;
  optional: string;
  hint: string;
  count: number;
  max: number;
  tooLong: string | null;
  counterLabel: (count: number, max: number) => string;
  children: (describedBy: string) => React.ReactNode;
}) {
  const hintId = `${id}-hint`;
  const counterId = `${id}-counter`;
  const errorId = `${id}-error`;
  const near = count >= max * 0.9;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} <span className="font-normal text-muted">({optional})</span>
      </label>
      {children(`${hintId} ${counterId}${tooLong ? ` ${errorId}` : ""}`)}
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
        <p
          id={counterId}
          aria-live={near ? "polite" : "off"}
          className={`mt-1 text-sm tabular-nums ${count > max ? "font-medium text-red-700" : "text-muted"}`}
        >
          {counterLabel(count, max)}
        </p>
      </div>
      {tooLong && (
        <p id={errorId} className="mt-1 text-sm font-medium text-red-700">
          {tooLong}
        </p>
      )}
    </div>
  );
}
