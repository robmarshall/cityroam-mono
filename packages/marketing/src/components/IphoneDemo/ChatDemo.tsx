"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";

/**
 * Three parties, drawn the way the player app draws them: "user" is the
 * visitor's own phone (right, blue, no label), "player" is someone else in
 * the group (left, grey bubble, named from `chatDemo.player`), and "guide"
 * is the Owl (left, lighter bubble, named from `chatDemo.guideLabel`).
 */
type Sender = "guide" | "user" | "player";

export type Message = {
  id: number;
  sender: Sender;
  /** Name shown above the bubble for another player. */
  name?: string;
  text: string;
};

// Who sends each line of the two scripted conversations in `chatDemo.*`.
const SCRIPTS: Record<"hero" | "howItWorks", Sender[]> = {
  hero: ["guide", "user", "player", "guide", "user", "guide"],
  howItWorks: ["guide", "guide", "guide", "guide", "guide", "user"],
};

export function useDemoMessages(variant: "hero" | "howItWorks"): Message[] {
  const t = useTranslations("chatDemo");
  return SCRIPTS[variant].map((sender, i) => ({
    id: i,
    sender,
    name: sender === "player" ? t("player") : undefined,
    text: t(`${variant}.${i}`),
  }));
}

const animationVariants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 500,
      damping: 30,
      mass: 1,
    },
  },
};

function TypingIndicator() {
  return (
    <div className="mb-1 mr-[25%] flex justify-start">
      <div className="flex items-center gap-1.5 rounded-bubble rounded-bl-sm bg-bubble-guide px-4 py-3">
        <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
        <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
        <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  isFirstInGroup,
  guideLabel,
  animate = false,
  size = "xs",
}: {
  message: Message;
  isFirstInGroup: boolean;
  guideLabel: string;
  animate?: boolean;
  size?: "xs" | "sm";
}) {
  const isUser = message.sender === "user";
  const isGuide = message.sender === "guide";
  // Mirrors the player app (ChatPage.tsx): the guide and other players are
  // named above their bubbles; your own messages are unlabelled.
  const label = isGuide ? guideLabel : message.name;

  return (
    <motion.div
      className={`flex ${isUser ? "ml-[20%] justify-end" : "mr-[20%] justify-start"} mb-chat-gap`}
      // Inline display on the layout boxes: the phone frame's CSS module sets
      // every descendant to display:block, which beats the flex classes and
      // would stretch every bubble to the full width.
      style={{ display: "flex" }}
      variants={animationVariants}
      // `false` renders straight into the final state, so bubbles that are
      // there on first paint never start invisible.
      initial={animate ? "initial" : false}
      animate="animate"
    >
      <div
        className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
        style={{ display: "flex" }}
      >
        {!isUser && isFirstInGroup && label && (
          <div className={`mb-0.5 ml-1 font-medium text-gray-600 ${size === "sm" ? "text-xs" : "text-[10px]"}`}>
            {label}
          </div>
        )}
        <div
          className={`whitespace-pre-wrap px-3 py-2 leading-relaxed ${size === "sm" ? "text-sm" : "text-xs"} ${
            isUser
              ? // The snippet is real, readable text, so it uses the darker blue
                // that passes AA with white. The phone mock keeps the app's own.
                `rounded-bubble rounded-br-sm text-white ${size === "sm" ? "bg-brand-600" : "bg-bubble-self"}`
              : `rounded-bubble rounded-bl-sm text-gray-900 ${isGuide ? "bg-bubble-guide" : "bg-bubble-other"}`
          }`}
        >
          {message.text}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * The scripted conversation inside the phone mock.
 *
 * The first paint (including the server-rendered HTML) already shows the
 * whole conversation bar its last line, so the phone never appears empty.
 * With motion allowed, the last line then arrives after a short pause, with
 * the typing indicator first if the guide is sending it. With reduced motion
 * the finished conversation is shown and nothing moves.
 */
export default function ChatDemo({ variant }: { variant: "hero" | "howItWorks" }) {
  const t = useTranslations("chatDemo");
  const allMessages = useDemoMessages(variant);
  const reduceMotion = useReducedMotion() ?? false;

  const [shown, setShown] = useState(allMessages.length - 1);
  const [isTyping, setIsTyping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduceMotion) {
      setIsTyping(false);
      setShown(allMessages.length);
      return;
    }

    const last = allMessages[allMessages.length - 1];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const pause = variant === "hero" ? 1800 : 2400;

    if (last?.sender === "guide") {
      timers.push(setTimeout(() => setIsTyping(true), pause));
      timers.push(
        setTimeout(() => {
          setIsTyping(false);
          setShown(allMessages.length);
        }, pause + 1400),
      );
    } else {
      timers.push(setTimeout(() => setShown(allMessages.length), pause + 600));
    }

    return () => timers.forEach(clearTimeout);
  }, [reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the newest message in view if the conversation outgrows the screen.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [shown, isTyping]);

  const messages = allMessages.slice(0, shown);
  const initialCount = allMessages.length - 1;

  return (
    // overflow-hidden, not auto: the demo is decorative (aria-hidden), and a
    // scrollable box would be a keyboard stop inside it.
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden bg-white p-3 pt-10">
      <div className="mt-auto">
        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          return (
            <MessageBubble
              key={`${variant}-${msg.id}`}
              message={msg}
              isFirstInGroup={!prev || prev.sender !== msg.sender}
              guideLabel={t("guideLabel")}
              animate={!reduceMotion && idx >= initialCount}
            />
          );
        })}
        {isTyping && <TypingIndicator />}
      </div>
    </div>
  );
}
