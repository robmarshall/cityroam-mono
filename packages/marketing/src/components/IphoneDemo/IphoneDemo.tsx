"use client";

import { useTranslations } from "next-intl";
import IPhoneFrame from "@/components/IphoneFrame/IphoneFrame";
import ChatDemo from "./ChatDemo";

export default function IphoneDemo({
  variant,
}: {
  variant: "hero" | "howItWorks";
}) {
  const t = useTranslations("chatDemo");
  const width = variant === "hero" ? 320 : 280;

  // The chat is illustration only. Screen readers get one label instead of a
  // conversation that changes under them. ChatDemo is imported directly (it
  // used to be lazy-loaded) so the server HTML already contains the chat and
  // the phone never paints empty.
  return (
    <div role="img" aria-label={t("ariaLabel")}>
      <div aria-hidden="true">
        <IPhoneFrame width={width} boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)">
          <ChatDemo variant={variant} />
        </IPhoneFrame>
      </div>
    </div>
  );
}
