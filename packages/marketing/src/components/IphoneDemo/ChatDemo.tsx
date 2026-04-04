"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

type Message = {
  id: number;
  sender: "guide" | "user";
  text: string;
};

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
    <div className="flex justify-start mr-[25%] mb-1">
      <div className="flex flex-col items-start">
        <div className="bg-bubble-guide rounded-bubble rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
          <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
          <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
          <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isFirstInGroup,
  guideLabel,
}: {
  message: Message;
  isFirstInGroup: boolean;
  guideLabel: string;
}) {
  const isUser = message.sender === "user";

  return (
    <motion.div
      className={`flex ${isUser ? "justify-end ml-[25%]" : "justify-start mr-[25%]"} mb-chat-gap`}
      variants={animationVariants}
      initial="initial"
      animate="animate"
    >
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && isFirstInGroup && (
          <div className="text-[10px] text-gray-500 ml-1 mb-0.5 font-medium">
            {guideLabel}
          </div>
        )}
        <div
          className={`px-3 py-2 whitespace-pre-wrap text-xs leading-relaxed ${
            isUser
              ? "bg-bubble-self text-white rounded-bubble rounded-br-sm"
              : "bg-bubble-guide text-gray-900 rounded-bubble rounded-bl-sm"
          }`}
        >
          {message.text}
        </div>
      </div>
    </motion.div>
  );
}

export default function ChatDemo({
  variant,
}: {
  variant: "hero" | "howItWorks";
}) {
  const t = useTranslations("chatDemo");

  const heroMessages: Message[] = [
    { id: 1, sender: "user", text: t("hero.0") },
    { id: 2, sender: "guide", text: t("hero.1") },
    { id: 3, sender: "guide", text: t("hero.2") },
    { id: 4, sender: "guide", text: t("hero.3") },
    { id: 5, sender: "guide", text: t("hero.4") },
  ];

  const howItWorksMessages: Message[] = [
    { id: 1, sender: "guide", text: t("howItWorks.0") },
    { id: 2, sender: "guide", text: t("howItWorks.1") },
    { id: 3, sender: "guide", text: t("howItWorks.2") },
    { id: 4, sender: "guide", text: t("howItWorks.3") },
    { id: 5, sender: "guide", text: t("howItWorks.4") },
    { id: 6, sender: "user", text: t("howItWorks.5") },
  ];

  const heroInitial: Message[] = [
    { id: 0, sender: "guide", text: t("hero.initial") },
  ];

  const allMessages = variant === "hero" ? heroMessages : howItWorksMessages;
  const initial = variant === "hero" ? heroInitial : [];

  const [messages, setMessages] = useState<Message[]>(initial);
  const [isTyping, setIsTyping] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let index = 0;

    const scheduleNext = () => {
      if (index >= allMessages.length) return;

      const msg = allMessages[index]!;
      const isGuide = msg.sender === "guide";

      // Show typing indicator for guide messages
      if (isGuide) {
        const typingDelay = variant === "hero" ? 800 : 1200;
        const t1 = setTimeout(() => {
          setIsTyping(true);
        }, variant === "hero" ? 1000 : 1500);
        timeoutsRef.current.push(t1);

        const t2 = setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [...prev, msg]);
          index++;
          scheduleNext();
        }, (variant === "hero" ? 1000 : 1500) + typingDelay + Math.random() * 500);
        timeoutsRef.current.push(t2);
      } else {
        const delay = variant === "hero" ? 1200 : 1800;
        const t = setTimeout(() => {
          setMessages((prev) => [...prev, msg]);
          index++;
          scheduleNext();
        }, delay);
        timeoutsRef.current.push(t);
      }
    };

    const startDelay = setTimeout(scheduleNext, variant === "hero" ? 1500 : 1000);
    timeoutsRef.current.push(startDelay);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-white overflow-y-auto p-3 pt-8"
    >
      {messages.map((msg, idx) => {
        const prev = messages[idx - 1];
        const isFirstInGroup = !prev || prev.sender !== msg.sender;

        return (
          <MessageBubble
            key={`${variant}-${msg.id}`}
            message={msg}
            isFirstInGroup={isFirstInGroup}
            guideLabel={t("guideLabel")}
          />
        );
      })}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
