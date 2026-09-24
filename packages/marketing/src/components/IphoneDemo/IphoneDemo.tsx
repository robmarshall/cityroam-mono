"use client";

import { lazy, Suspense } from "react";
import { useTranslations } from "next-intl";
import IPhoneFrame from "@/components/IphoneFrame/IphoneFrame";

const ChatDemo = lazy(() => import("./ChatDemo"));

export default function IphoneDemo({
  variant,
}: {
  variant: "hero" | "howItWorks";
}) {
  const t = useTranslations("chatDemo");
  const width = variant === "hero" ? 320 : 280;

  // The animated chat is illustration only. Screen readers get one label
  // instead of a conversation that keeps changing under them.
  return (
    <div role="img" aria-label={t("ariaLabel")}>
      <div aria-hidden="true">
        <IPhoneFrame width={width} boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)">
          <Suspense fallback={null}>
            <ChatDemo variant={variant} />
          </Suspense>
        </IPhoneFrame>
      </div>
    </div>
  );
}
