import { useEffect, useState } from "react";

/** Screens, in reading order for the CEO. Each one is a URL hash, so reloads and the back button work. */
export const PAGES = [
  { id: "overview", label: "Overview", short: "Overview", hint: "Decision summary" },
  { id: "roadmap", label: "Roadmap", short: "Roadmap", hint: "Milestones and timing" },
  { id: "workforce", label: "Workforce", short: "Workforce", hint: "Skills and people per milestone" },
  { id: "options", label: "Options", short: "Options", hint: "How to staff each option" },
  { id: "finance", label: "Money", short: "Money", hint: "Costs, benefits and payback" },
  { id: "assumptions", label: "Assumptions", short: "Assumptions", hint: "Editable mock inputs" },
] as const;

export type PageId = (typeof PAGES)[number]["id"];

const PAGE_IDS = new Set<string>(PAGES.map((p) => p.id));

function pageFromHash(hash: string): PageId {
  const id = hash.replace(/^#\/?/, "");
  return PAGE_IDS.has(id) ? (id as PageId) : "overview";
}

export function useHashPage(): [PageId, (p: PageId) => void] {
  const [page, setPage] = useState<PageId>(() => pageFromHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = (p: PageId) => {
    if (window.location.hash !== `#/${p}`) window.location.hash = `/${p}`;
  };
  return [page, go];
}
