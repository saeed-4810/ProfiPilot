"use client";

import { MotionWrapper } from "@/components/MotionWrapper";

export default function DashboardPage() {
  return (
    <MotionWrapper>
      <main
        data-testid="dashboard-page"
        className="min-h-screen p-8 bg-neutral-950 text-neutral-50"
      >
        <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
        <p className="text-neutral-400">Project overview coming soon — PERF-102</p>
      </main>
    </MotionWrapper>
  );
}
