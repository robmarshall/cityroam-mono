"use client";

import { useTranslations } from "next-intl";
import { MessageBubble, useDemoMessages } from "./ChatDemo";

/**
 * A few lines of the hero conversation for phones, where the full phone mock
 * is too tall to sit in the hero. Static text, so it is readable on first
 * paint and needs no motion handling. Real text (not aria-hidden): it is short
 * enough to read out, and the caption says it's an example.
 */
export default function ChatSnippet({ className = "" }: { className?: string }) {
  const t = useTranslations("chatDemo");
  const th = useTranslations("home.hero");
  // The clue, your guess, another player's question and the guide's reply
  // to both: enough to show it is a group chat.
  const messages = useDemoMessages("hero").slice(0, 4);

  return (
    <figure className={`mx-auto w-full max-w-sm text-left ${className}`}>
      <div className="rounded-card bg-white p-3 shadow-sm ring-1 ring-gray-200">
        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isFirstInGroup={!prev || prev.sender !== msg.sender}
              guideLabel={t("guideLabel")}
              size="sm"
            />
          );
        })}
      </div>
      <figcaption className="mt-2 text-center text-sm text-gray-600">{th("demoCaption")}</figcaption>
    </figure>
  );
}
