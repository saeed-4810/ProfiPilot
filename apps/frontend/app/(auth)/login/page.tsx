"use client";

import { MotionWrapper } from "@/components/MotionWrapper";

export default function LoginPage() {
  return (
    <MotionWrapper>
      <main
        data-testid="login-page"
        className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-950 text-neutral-50"
      >
        <h1 className="text-3xl font-bold mb-4">Sign in to PrefPilot</h1>
        <p className="text-neutral-400">Authentication coming soon — PERF-98</p>
      </main>
    </MotionWrapper>
  );
}
