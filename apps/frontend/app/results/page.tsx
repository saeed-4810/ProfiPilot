"use client";

import { MotionWrapper } from "@/components/MotionWrapper";

export default function ResultsPage() {
  return (
    <MotionWrapper>
      <main data-testid="results-page" className="min-h-screen p-8 bg-neutral-950 text-neutral-50">
        <h1 className="text-3xl font-bold mb-4">Results</h1>
        <p className="text-neutral-400">AI-powered results and insights coming soon — PERF-101</p>
      </main>
    </MotionWrapper>
  );
}
