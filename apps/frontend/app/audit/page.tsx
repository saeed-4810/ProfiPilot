"use client";

import { MotionWrapper } from "@/components/MotionWrapper";

export default function AuditPage() {
  return (
    <MotionWrapper>
      <main data-testid="audit-page" className="min-h-screen p-8 bg-neutral-950 text-neutral-50">
        <h1 className="text-3xl font-bold mb-4">Audit</h1>
        <p className="text-neutral-400">Preference audit engine coming soon — PERF-100</p>
      </main>
    </MotionWrapper>
  );
}
