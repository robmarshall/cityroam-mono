"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";

type Sender = "guide" | "user";

export type Message = {
  id: number;
  sender: Sender;
  text: string;
};

// Who sends each line of the two scripted conversations in `chatDemo.*`.
const SCRIPTS: Record<"hero" | "howItWorks", Sender[]> = {
  hero: ["guide", "user", "guide", "user", "guide", "user", "guide"],
  howItWorks: ["guide", "guide", "guide", "guide", "guide", "user"],
};

export function useDemoMessages(variant: "hero" | "howItWorks"): Message[] {
  const t = useTranslations("chatDemo");
  return SCRIPTS[variant].map((sender, i) => ({
    id: i,
    sender,
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

  return (
    <motion.div
      className={`flex ${isUser ? "ml-[20%] justify-end" : "mr-[20%] justify-start"} mb-chat-gap`}
      variants={animationVariants}
      // `false` renders straight into the final state, so bubbles that are
      // there on first paint never start invisible.
      initial={animate ? "initial" : false}
      animate="animate"
    >
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && isFirstInGroup && (
          <div className="mb-0.5 ml-1 text-[10px] font-medium text-gray-500">{guideLabel}</div>
        )}
        <div
          className={`whitespace-pre-wrap px-3 py-2 leading-relaxed ${size === "sm" ? "text-sm" : "text-xs"} ${
            isUser
              ? // The snippet is real, readable text, so it uses the darker blue
                // that passes AA with white. The phone mock keeps the app's own.
                `rounded-bubble rounded-br-sm text-white ${size === "sm" ? "bg-brand-600" : "bg-bubble-self"}`
              : "rounded-bubble rounded-bl-sm bg-bubble-guide text-gray-900"
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
