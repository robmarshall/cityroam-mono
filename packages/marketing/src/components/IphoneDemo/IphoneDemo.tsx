"use client";

import { lazy, Suspense } from "react";
import IPhoneFrame from "@/components/IphoneFrame/IphoneFrame";

const ChatDemo = lazy(() => import("./ChatDemo"));

export default function IphoneDemo({
  variant,
}: {
  variant: "hero" | "howItWorks";
}) {
  const width = variant === "hero" ? 350 : 300;

  return (
    <IPhoneFrame
      width={width}
      boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
    >
      <Suspense fallback={null}>
        <ChatDemo variant={variant} />
      </Suspense>
    </IPhoneFrame>
  );
}
