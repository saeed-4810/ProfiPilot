import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectSidebar } from "../../components/ProjectSidebar";

describe("ProjectSidebar", () => {
  it("renders project navigation with 5 items", () => {
    render(<ProjectSidebar />);

    expect(screen.getByTestId("project-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("project-nav-overview")).toBeInTheDocument();
    expect(screen.getByTestId("project-nav-metric-trends")).toBeInTheDocument();
    expect(screen.getByTestId("project-nav-audit-history")).toBeInTheDocument();
    expect(screen.getByTestId("project-nav-url-registry")).toBeInTheDocument();
    expect(screen.getByTestId("project-nav-settings")).toBeInTheDocument();
  });

  it("marks Overview as active with aria-current", () => {
    render(<ProjectSidebar />);

    const overview = screen.getByTestId("project-nav-overview");
    expect(overview).toHaveAttribute("aria-current", "page");
  });

  it("marks coming-soon items with aria-label", () => {
    render(<ProjectSidebar />);

    const metricTrends = screen.getByTestId("project-nav-metric-trends");
    expect(metricTrends).toHaveAttribute("aria-label", "Metric Trends — Coming soon");
  });

  it("shows 'Soon' badge on coming-soon items", () => {
    render(<ProjectSidebar />);

    const sidebar = screen.getByTestId("project-sidebar");
    // 4 coming-soon items should have "Soon" text
    const soonBadges = sidebar.querySelectorAll("span");
    const soonTexts = Array.from(soonBadges).filter((el) => el.textContent === "Soon");
    expect(soonTexts).toHaveLength(4);
  });

  it("has accessible navigation landmark", () => {
    render(<ProjectSidebar />);

    const nav = screen.getByTestId("project-sidebar");
    expect(nav).toHaveAttribute("aria-label", "Project navigation");
  });

  it("uses uppercase tracking-widest for labels", () => {
    render(<ProjectSidebar />);

    const overview = screen.getByTestId("project-nav-overview");
    const labelSpan = overview.querySelector("span.uppercase");
    expect(labelSpan).toBeInTheDocument();
    expect(labelSpan?.className).toContain("tracking-widest");
  });
});
