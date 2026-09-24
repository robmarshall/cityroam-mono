"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type {
  SupportedLanguage,
  VoucherLookupResponse,
  VoucherRedeemResponse,
} from "@cityroam/shared/types";
import { SUPPORTED_LANGUAGES } from "@cityroam/shared/constants";
import { CONTACT_EMAIL, LINK_VALID_DAYS } from "@/lib/site";
import {
  FINAL_PROBLEMS,
  formatCodeInput,
  lookupVoucher,
  problemForFailure,
  problemForStatus,
  redeemVoucher,
  retryMinutes,
  toVoucherCode,
  type CodeProblem,
} from "./voucher-api";
import { CopyField, useFocusOnChange } from "./ui";
import {
  formatDate,
  hintClass,
  inputClass,
  labelClass,
  linkClass,
  primaryButtonClass,
  primaryButtonSmallClass,
  secondaryButtonClass,
} from "./styles";

/** Each language in its own name, for the picker. */
const ENDONYMS: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  nl: "Nederlands",
};

type Problem = { kind: CodeProblem; retryAfter?: number };

export type RedeemState =
  | { step: "enter"; problem?: Problem }
  | { step: "checking" }
  | { step: "valid"; voucher: VoucherLookupResponse; problem?: Problem }
  | { step: "redeeming"; voucher: VoucherLookupResponse }
  | { step: "done"; result: VoucherRedeemResponse; requested: SupportedLanguage; gaveEmail: boolean }
  /** A final answer (used, expired, refunded, void): no try-again. */
  | { step: "final"; problem: Problem };

/**
 * The redemption page's flow: the code (prefilled from ?code= on the printed
 * card), a lookup, then an optional email and the language, then the game.
 * 409 and 410 answers are final and never offered as "try again".
 */
export function RedeemFlow({ initialCode }: { initialCode: string }) {
  const t = useTranslations("gift.redeem");
  const locale = useLocale() as SupportedLanguage;
  const id = useId();

  const [code, setCode] = useState(() => formatCodeInput(initialCode));
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState<SupportedLanguage>(locale);
  const [state, setState] = useState<RedeemState>({ step: "enter" });
  const busy = useRef(false);
  const autoChecked = useRef(false);

  // Focus follows the flow: the result heading after a check, the problem
  // message after a refusal, the game link once it exists.
  const focusKey =
    state.step === "checking" || state.step === "redeeming"
      ? null
      : `${state.step}:${"problem" in state && state.problem ? state.problem.kind : ""}`;
  const resultRef = useFocusOnChange<HTMLHeadingElement & HTMLParagraphElement>(focusKey);
  const codeInputRef = useRef<HTMLInputElement>(null);

  async function check(raw = code) {
    if (busy.current) return;
    const canonical = toVoucherCode(raw);
    if (!canonical) {
      setState({ step: "enter", problem: { kind: "notACode" } });
      return;
    }
    setCode(canonical);
    busy.current = true;
    setState({ step: "checking" });
    const result = await lookupVoucher(canonical);
    busy.current = false;

    if (!result.ok) {
      setState({
        step: "enter",
        problem: { kind: problemForFailure(result), retryAfter: result.retryAfter },
      });
      return;
    }
    const problem = problemForStatus(result.data);
    setState(problem ? { step: "final", problem: { kind: problem } } : { step: "valid", voucher: result.data });
  }

  async function redeem(voucher: VoucherLookupResponse) {
    if (busy.current) return;
    busy.current = true;
    setState({ step: "redeeming", voucher });
    const result = await redeemVoucher(voucher.code, { language, email });

    if (result.ok) {
      // Leave `busy` set: this code is spent, nothing more to submit.
      setState({ step: "done", result: result.data, requested: language, gaveEmail: !!email.trim() });
      return;
    }
    busy.current = false;
    const kind = problemForFailure(result);
    const problem = { kind, retryAfter: result.retryAfter };
    if (FINAL_PROBLEMS.has(kind)) setState({ step: "final", problem });
    else if (kind === "notFound" || kind === "notACode") setState({ step: "enter", problem });
    else setState({ step: "valid", voucher, problem });
  }

  // A link from the card carries the code: check it straight away.
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    if (initialCode && toVoucherCode(initialCode)) void check(initialCode);
  }, []);

  function startOver() {
    busy.current = false;
    setCode("");
    setState({ step: "enter" });
    requestAnimationFrame(() => codeInputRef.current?.focus());
  }

  const problemText = (p: Problem) =>
    t(`problems.${p.kind}`, { email: CONTACT_EMAIL, minutes: retryMinutes(p.retryAfter) });

  if (state.step === "done") {
    return <Done state={state} headingRef={resultRef} />;
  }

  if (state.step === "final") {
    return (
      <div>
        <p
          ref={resultRef}
          tabIndex={-1}
          role="alert"
          className="rounded-card bg-white px-6 py-5 text-lg leading-relaxed text-ink-900 ring-1 ring-stone-200 focus:outline-none"
        >
          {problemText(state.problem)}
        </p>
        <button type="button" onClick={startOver} className={`mt-6 ${secondaryButtonClass}`}>
          {t("another")}
        </button>
      </div>
    );
  }

  const codeId = `${id}-code`;
  const codeHintId = `${id}-code-hint`;
  const codeErrorId = `${id}-code-error`;
  const checking = state.step === "checking";
  const codeLocked = state.step === "valid" || state.step === "redeeming";
  const enterProblem = state.step === "enter" ? state.problem : undefined;

  return (
    <div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <label htmlFor={codeId} className={labelClass}>
          {t("codeLabel")}
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            ref={codeInputRef}
            id={codeId}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={() => setCode((c) => formatCodeInput(c))}
            readOnly={codeLocked}
            disabled={checking}
            maxLength={40}
            aria-describedby={`${codeHintId}${enterProblem ? ` ${codeErrorId}` : ""}`}
            aria-invalid={enterProblem && enterProblem.kind !== "unavailable" && enterProblem.kind !== "rateLimited" ? true : undefined}
            className={`${inputClass} font-mono tracking-[0.12em] uppercase read-only:bg-stone-100 sm:flex-1`}
          />
          {!codeLocked && (
            <button type="submit" disabled={checking} aria-busy={checking} className={primaryButtonSmallClass}>
              {checking ? t("checking") : t("check")}
            </button>
          )}
        </div>
        <p id={codeHintId} className={hintClass}>
          {t("codeHint")}
        </p>
        <div aria-live="polite">
          {checking && <p className="sr-only">{t("checking")}</p>}
        </div>
        {enterProblem && (
          <p
            id={codeErrorId}
            ref={resultRef}
            tabIndex={-1}
            role="alert"
            className="mt-3 font-medium text-red-700 focus:outline-none"
          >
            {problemText(enterProblem)}
          </p>
        )}
      </form>

      {(state.step === "valid" || state.step === "redeeming") && (
        <RedeemForm
          voucher={state.voucher}
          problem={state.step === "valid" ? state.problem : undefined}
          problemText={problemText}
          redeeming={state.step === "redeeming"}
          email={email}
          setEmail={setEmail}
          language={language}
          setLanguage={setLanguage}
          onSubmit={() => redeem(state.voucher)}
          onStartOver={startOver}
          headingRef={resultRef}
        />
      )}
    </div>
  );
}

function RedeemForm({
  voucher,
  problem,
  problemText,
  redeeming,
  email,
  setEmail,
  language,
  setLanguage,
  onSubmit,
  onStartOver,
  headingRef,
}: {
  voucher: VoucherLookupResponse;
  problem?: Problem;
  problemText: (p: Problem) => string;
  redeeming: boolean;
  email: string;
  setEmail: (v: string) => void;
  language: SupportedLanguage;
  setLanguage: (v: SupportedLanguage) => void;
  onSubmit: () => void;
  onStartOver: () => void;
  headingRef: React.RefObject<(HTMLHeadingElement & HTMLParagraphElement) | null>;
}) {
  const t = useTranslations("gift.redeem");
  const locale = useLocale();
  const id = useId();
  const emailId = `${id}-email`;
  const languageId = `${id}-language`;

  return (
    <section className="mt-8 rounded-card bg-white px-6 py-8 ring-1 ring-stone-200" aria-labelledby={`${id}-title`}>
      <h2
        id={`${id}-title`}
        ref={problem ? undefined : headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-semibold text-ink-900 focus:outline-none"
      >
        {t("valid.title")}
      </h2>
      <p className="mt-2 text-ink-700">
        {t("valid.redeemBy", { date: formatDate(locale, voucher.expires_at) })}{" "}
        {voucher.route_family &&
          t("valid.family", { name: voucher.route_family.name, city: voucher.route_family.city })}
      </p>
      <p className="mt-1 text-muted">{t("valid.window", { days: LINK_VALID_DAYS })}</p>

      <form
        noValidate
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div>
          <label htmlFor={emailId} className={labelClass}>
            {t("form.emailLabel")} <span className="font-normal text-muted">({t("form.optional")})</span>
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={redeeming}
            maxLength={254}
            aria-describedby={`${emailId}-hint`}
            aria-invalid={problem?.kind === "badEmail" || undefined}
            className={`mt-2 ${inputClass}`}
          />
          <p id={`${emailId}-hint`} className={hintClass}>
            {t("form.emailHint")}
          </p>
        </div>

        <div>
          <label htmlFor={languageId} className={labelClass}>
            {t("form.languageLabel")}
          </label>
          <select
            id={languageId}
            value={language}
            onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
            disabled={redeeming}
            className={`mt-2 ${inputClass} sm:max-w-xs`}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l} value={l} lang={l}>
                {ENDONYMS[l]}
              </option>
            ))}
          </select>
        </div>

        {problem && (
          <p ref={headingRef} tabIndex={-1} role="alert" className="font-medium text-red-700 focus:outline-none">
            {problemText(problem)}
          </p>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button type="submit" disabled={redeeming} aria-busy={redeeming} className={primaryButtonClass}>
            {redeeming ? t("form.submitting") : problem ? t("tryAgain") : t("form.submit")}
          </button>
          <button type="button" onClick={onStartOver} disabled={redeeming} className={`${linkClass} self-start sm:self-auto`}>
            {t("another")}
          </button>
        </div>
        <div aria-live="polite" className="sr-only">
          {redeeming ? t("form.submitting") : ""}
        </div>
      </form>
    </section>
  );
}

function Done({
  state,
  headingRef,
}: {
  state: Extract<RedeemState, { step: "done" }>;
  headingRef: React.RefObject<(HTMLHeadingElement & HTMLParagraphElement) | null>;
}) {
  const t = useTranslations("gift.redeem.done");
  const tl = useTranslations("gift.languages");
  const locale = useLocale();
  const { result, requested, gaveEmail } = state;

  return (
    <div>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-3xl font-semibold text-ink-900 focus:outline-none"
      >
        {t("title")}
      </h2>

      <div className="mt-6 rounded-card bg-white px-6 py-8 text-center ring-1 ring-stone-200">
        <p className="text-sm font-medium text-muted">{t("codeLabel")}</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.12em] break-all text-ink-900">
          {result.event_code}
        </p>
        <a href={result.event_url} className={`mt-6 w-full sm:w-auto ${primaryButtonClass}`}>
          {t("open")}
        </a>
        <p className="mt-6 text-left text-ink-700">{t("share")}</p>
        <div className="mt-4 text-left">
          <CopyField
            id="redeem-game-link"
            label={t("linkLabel")}
            value={result.event_url}
            copyLabel={t("copy")}
            copiedLabel={t("copied")}
          />
        </div>
        <p className="mt-4 text-left text-sm text-muted">
          {t("expires", { date: formatDate(locale, result.event_expires_at) })}
        </p>
      </div>

      <div className="mt-6 space-y-2 text-ink-700">
        <p>{gaveEmail ? (result.email_sent ? t("emailed") : t("emailFailed")) : t("noEmail")}</p>
        {result.language !== requested && (
          <p>
            {t("fallbackLanguage", { requested: tl(requested), language: tl(result.language) })}
          </p>
        )}
      </div>
    </div>
  );
}
