"use client";

import { MotionWrapper } from "@/components/MotionWrapper";

export default function ExportPage() {
  return (
    <MotionWrapper>
      <main data-testid="export-page" className="min-h-screen p-8 bg-neutral-950 text-neutral-50">
        <h1 className="text-3xl font-bold mb-4">Export</h1>
        <p className="text-neutral-400">Export and billing coming soon — PERF-103</p>
      </main>
    </MotionWrapper>
  );
}
