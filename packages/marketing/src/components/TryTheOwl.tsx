"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type { SupportedLanguage } from "@cityroam/shared/types";
import { CTAButton, type CheckoutSegment } from "@/components/CTAButton";
import { trackEvent } from "@/lib/analytics";
import {
  initialDemoState,
  MAX_INPUT_LENGTH,
  sendMessage,
  type DemoEvent,
  type DemoState,
} from "@/lib/demo/engine";
import { factValues } from "@/lib/facts";

/** How long the Owl "types" before each line, when motion is allowed. */
const TYPING_MS = 700;

type ChipId = "wrongGuess" | "hint" | "distance";
const CHIPS: ChipId[] = ["wrongGuess", "hint", "distance"];

/**
 * "Try the Owl": a scripted, client-side taste of the game, drawn like the
 * player app's chat (your messages blue on the right, the Owl's in a light
 * bubble on the left with its name above and no icon).
 *
 * One sample clue from off the route. Answers are checked with the game's own
 * matcher (@cityroam/shared/answer-match); hints, a small Q&A bank and an
 * honest fallback cover the rest (see src/lib/demo). Nothing is sent to a
 * server, so the caption says plainly that on the day the Owl replies to
 * what the group types.
 *
 * Accessibility: the conversation is a `role="log"` live region, so each new
 * line is announced; the input has a label; the chips and buttons are plain
 * buttons; the log scrolls inside a fixed height and is keyboard-focusable.
 * With reduced motion there is no typing indicator and replies appear at once.
 */
export function TryTheOwl({
  location,
  segment = "general",
  className = "",
}: {
  /** Analytics location for the demo events and the booking button ("home", "treasure-hunt"). */
  location: string;
  segment?: CheckoutSegment;
  className?: string;
}) {
  const t = useTranslations("demo");
  const tc = useTranslations("chatDemo");
  const tf = useTranslations("facts");
  const facts = factValues(tf);
  const locale = useLocale() as SupportedLanguage;
  const reduceMotion = useReducedMotion() ?? false;

  const [state, setState] = useState<DemoState>(initialDemoState);
  // How many of state.messages are on screen: the Owl's replies are revealed
  // one at a time behind a typing indicator.
  const [shown, setShown] = useState(() => initialDemoState().messages.length);
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const pending = shown < state.messages.length;
  const typing = pending && !reduceMotion;

  useEffect(() => {
    if (!pending) return;
    if (reduceMotion) {
      setShown(state.messages.length);
      return;
    }
    const timer = setTimeout(() => setShown((n) => n + 1), TYPING_MS);
    return () => clearTimeout(timer);
  }, [pending, shown, reduceMotion, state.messages.length]);

  // Keep the newest line in view. Only the log scrolls, never the page.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [shown, typing]);

  function track(events: DemoEvent[]) {
    for (const event of events) {
      switch (event.type) {
        case "started":
          trackEvent(POSTHOG_EVENTS.DEMO_STARTED, { location });
          break;
        case "answered":
          trackEvent(POSTHOG_EVENTS.DEMO_ANSWERED, { location, result: event.result });
          break;
        case "hint":
          trackEvent(POSTHOG_EVENTS.DEMO_HINT, { location, hint: event.hint, revealed: event.revealed });
          break;
        case "completed":
          trackEvent(POSTHOG_EVENTS.DEMO_COMPLETED, {
            location,
            hints: event.hints,
            wrong_answers: event.wrongAnswers,
          });
          break;
      }
    }
  }

  function send(text: string) {
    if (pending || !text.trim()) return;
    const result = sendMessage(state, text, locale);
    setState(result.state);
    // The visitor's own message shows at once; the replies follow.
    setShown(reduceMotion ? result.state.messages.length : state.messages.length + 1);
    track(result.events);
  }

  function reset() {
    const fresh = initialDemoState();
    setState(fresh);
    setShown(fresh.messages.length);
    setDraft("");
  }

  const visible = state.messages.slice(0, shown);
  const done = state.phase === "done" && !pending;

  return (
    // data-book-cta: the mobile booking bar hides while the demo is on screen,
    // so it never covers the input, and there's one Book button in view once
    // the demo's own appears (it mounts later, so the bar can't observe it).
    <figure data-book-cta="" className={`w-full min-w-0 ${className}`}>
      <div
        role="group"
        aria-label={t("chatLabel")}
        className="overflow-hidden rounded-card bg-white text-left shadow-[0_12px_32px_-12px_rgba(20,33,61,0.25)] ring-1 ring-stone-200"
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-2.5">
          <p className="text-sm font-medium text-ink-700">{t("chatLabel")}</p>
          <button
            type="button"
            onClick={reset}
            className="-mr-2 min-h-11 rounded-button px-2 text-sm font-medium text-brick-600 underline underline-offset-2 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          >
            {t("reset")}
          </button>
        </div>

        {/* The conversation. A fixed height so the page doesn't jump as it grows. */}
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label={t("logLabel")}
          tabIndex={0}
          className="flex h-80 flex-col overflow-y-auto overscroll-contain px-3 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring) sm:h-96"
        >
          <div className="mt-auto">
            {visible.map((msg, i) => {
              const prev = visible[i - 1];
              const firstInGroup = !prev || prev.from !== msg.from;
              if (msg.from === "you") {
                return (
                  <div key={msg.id} className="mb-chat-gap ml-[15%] flex justify-end">
                    <p className="rounded-bubble rounded-br-sm bg-brand-600 px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap text-white">
                      <span className="sr-only">{t("you")}: </span>
                      {msg.text}
                    </p>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="mb-chat-gap mr-[15%] flex flex-col items-start">
                  {firstInGroup ? (
                    <p className="mb-0.5 ml-1 text-xs font-medium text-gray-600">{tc("guideLabel")}</p>
                  ) : null}
                  <p className="rounded-bubble rounded-bl-sm bg-bubble-guide px-3 py-2 text-sm leading-relaxed text-gray-900">
                    {!firstInGroup && <span className="sr-only">{tc("guideLabel")}: </span>}
                    {t(`owl.${msg.key}`, facts)}
                  </p>
                </div>
              );
            })}
            {typing && (
              <div aria-hidden="true" className="mb-chat-gap flex justify-start">
                <div className="flex items-center gap-1.5 rounded-bubble rounded-bl-sm bg-bubble-guide px-4 py-3">
                  <span className="typing-dot h-2 w-2 rounded-full bg-gray-500" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-gray-500" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-gray-500" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-stone-200 px-3 pt-3 pb-4">
          {done ? (
            <div className="px-1 pb-1">
              <CTAButton location="demo" label={t("cta")} segment={segment} fullWidth />
            </div>
          ) : (
            <ul aria-label={t("chipsLabel")} className="mb-3 flex flex-wrap gap-2">
              {CHIPS.map((chip) => (
                <li key={chip}>
                  <button
                    type="button"
                    onClick={() => send(t(`chips.${chip}`))}
                    aria-disabled={pending || undefined}
                    className="min-h-11 rounded-full bg-white px-3.5 text-sm font-medium text-ink-900 ring-1 ring-stone-300 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) motion-reduce:transition-none aria-disabled:cursor-wait"
                  >
                    {t(`chips.${chip}`)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className={`flex items-center gap-2 ${done ? "mt-3" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (pending || !draft.trim()) return;
              send(draft);
              setDraft("");
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {t("inputLabel")}
            </label>
            <input
              id={inputId}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_INPUT_LENGTH}
              autoComplete="off"
              enterKeyHint="send"
              placeholder={t("placeholder")}
              className="min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-4 py-2 text-base text-ink-900 placeholder:text-muted focus:border-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-disabled={pending || undefined}
              className="min-h-11 shrink-0 rounded-full bg-ink-900 px-4 text-sm font-semibold text-stone-50 transition-colors hover:bg-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:opacity-50 motion-reduce:transition-none"
            >
              {t("send")}
            </button>
          </form>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted">{t("caption")}</figcaption>
    </figure>
  );
}
