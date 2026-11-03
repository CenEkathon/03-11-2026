import { afterEach, describe, expect, it } from "vitest";
import { NL } from "./nl";
import { getLang, locale, setLang, t } from "./i18n";
import { formatAxisMonth, formatByUnit, formatEur, formatFte, formatMonth, formatPct } from "../lib/format";
import { ACTION_TYPE_HELP, ACTION_TYPE_LABEL, BADGE_MEANING, DISCLAIMER, LEVEL_NAMES, REASON_LABEL, SCENARIO_SHORT_LABEL } from "../lib/labels";
import { ANALYSIS_STEPS } from "../lib/analysisSteps";
import { SAMPLE_BRIEFS } from "../lib/sampleBriefs";
import { PAGES } from "../routing";

// Source files and mock fixtures are read with Vite's ?raw imports, so no Node typings are needed.
import goalRaw from "../../../backend/strategy_compiler/fixtures/goal.json?raw";
import roadmapRaw from "../../../backend/strategy_compiler/fixtures/roadmap.json?raw";
import requirementsRaw from "../../../backend/strategy_compiler/fixtures/requirements.json?raw";
import companyRaw from "../../../backend/strategy_compiler/fixtures/company.json?raw";
import taxonomyRaw from "../../../backend/strategy_compiler/fixtures/taxonomy.json?raw";
import assumptionsRaw from "../../../backend/strategy_compiler/fixtures/assumptions.yaml?raw";

const SOURCES = import.meta.glob("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

afterEach(() => setLang("en"));

describe("Dutch dictionary", () => {
  it("has a non-empty translation for every key, with the same placeholders", () => {
    for (const [key, value] of Object.entries(NL)) {
      expect(value.trim(), key).not.toBe("");
      expect(placeholders(value), key).toBe(placeholders(key));
    }
  });

  it("covers every literal t(\"...\") call in the source", () => {
    const pattern = /(?<![\w.])t\(\s*"((?:[^"\\]|\\.)*)"/g;
    const missing = new Set<string>();
    for (const [file, text] of Object.entries(SOURCES)) {
      if (file.includes(".test.")) continue;
      for (const match of text.matchAll(pattern)) {
        if (!(match[1] in NL)) missing.add(`${file}: ${match[1]}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("covers the label constants that are passed to t() through variables", () => {
    const constantTexts = [
      ...Object.values(BADGE_MEANING),
      ...Object.values(REASON_LABEL),
      ...Object.values(ACTION_TYPE_LABEL),
      ...Object.values(ACTION_TYPE_HELP),
      ...Object.values(SCENARIO_SHORT_LABEL),
      ...Object.values(LEVEL_NAMES),
      DISCLAIMER,
      ...ANALYSIS_STEPS,
      ...SAMPLE_BRIEFS.flatMap((s) => [s.label, s.text]),
      ...PAGES.flatMap((p) => [p.label, p.hint]),
      // Set in the components, not in a shared constant:
      "Auto",
      "Light",
      "Dark",
      "Low",
      "Base",
      "High",
      "Low confidence",
      "Medium confidence",
      "High confidence",
      "EUR/month",
      "EUR/year",
      "EUR/person",
      "EUR/hire",
      "EUR/day",
      "reviews/year",
      "months",
      "done",
      "month",
      "year",
      "person",
      "hire",
      "day",
      "m",
      "low",
      "medium",
      "high",
      "assumed",
      "mock_assumption",
      "HR / legal / employee-representation review required",
      // Backend text (config.py SCENARIO_META, engine.py _RATIONALE and _FORMULA):
      "Reskill-led",
      "Hire-led",
      "Hybrid (recommended)",
      "Reskill first (training ahead of need), then redeploy, then a capped contractor bridge, then hire the remainder.",
      "Hire first for each requirement, then a capped contractor bridge, then redeploy and reskill for any remainder.",
      "Redeploy first, then reskill where lead time allows, then a capped contractor bridge, then hire the remainder.",
      "Already at the required level. They are paid already, so the new cost is a move cost plus backfill of their old work.",
      "One or two levels short, with a related skill. Training finishes before the requirement starts, then backfill and a pay rise apply.",
      "Contractors bridge up to 30% of a need while lead time runs out. Not a permanent solution.",
      "Remaining gap after the earlier sources in this scenario, hired from the earliest possible start (programme start plus hire lead time).",
      "one-off = move cost per person; recurring = FTE x backfill share x yearly cost / 12",
      "one-off = training cost per person + move cost; recurring = FTE x (backfill share x yearly cost / 12 + yearly pay rise / 12)",
      "recurring = FTE x contractor day rate x 20 working days",
      "one-off = headcount x hire cost; recurring = headcount x yearly cost / 12, from start to requirement end",
    ];
    const missing = constantTexts.filter((text) => !(text in NL));
    expect(missing).toEqual([]);
  });

  it("covers the mock fixture text that the screens translate", () => {
    const goal = JSON.parse(goalRaw) as { title: string; statement: string; constraints: string[] };
    const roadmap = JSON.parse(roadmapRaw) as {
      milestones: { name: string; description: string; metric: { name: string } }[];
    };
    const requirements = JSON.parse(requirementsRaw) as {
      requirements: { role: string; rationale: string }[];
    };
    const company = JSON.parse(companyRaw) as { teams: { name: string }[] };
    const taxonomy = JSON.parse(taxonomyRaw) as { skills: { label: string }[] };
    const assumptionLines = [...assumptionsRaw.matchAll(/^\s+(label|rationale): (.+)$/gm)].map((m) => m[2].trim());

    const texts = [
      goal.title.replace(/^MOCK GOAL:\s*/, ""),
      goal.statement,
      ...goal.constraints,
      ...roadmap.milestones.flatMap((m) => [m.name, m.description, m.metric.name]),
      ...requirements.requirements.flatMap((r) => [r.role, r.rationale]),
      ...company.teams.map((team) => team.name),
      ...taxonomy.skills.map((skill) => skill.label),
      ...assumptionLines,
    ];
    expect(assumptionLines.length).toBe(24);
    expect(texts.filter((text) => !(text in NL))).toEqual([]);
  });
});

describe("t()", () => {
  it("returns the English text in English", () => {
    expect(t("Overview")).toBe("Overview");
  });

  it("returns the Dutch entry in Dutch and falls back to English for unknown text", () => {
    setLang("nl");
    expect(getLang()).toBe("nl");
    expect(t("Overview")).toBe("Overzicht");
    expect(t("A sentence without a translation")).toBe("A sentence without a translation");
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    setLang("nl");
    expect(t("Brief: {count} characters", { count: 42 })).toBe("Briefing: 42 tekens");
    expect(t("{a} and {missing}", { a: "x" })).toBe("x and {missing}");
  });

  it("does not treat inherited object properties as translations", () => {
    setLang("nl");
    expect(t("constructor")).toBe("constructor");
    expect(t("toString")).toBe("toString");
  });
});

describe("Dutch number and month formats", () => {
  it("uses Belgian Dutch separators and month names", () => {
    setLang("nl");
    expect(locale()).toBe("nl-BE");
    expect(formatEur(1234567.8)).toBe("EUR 1.234.568");
    expect(formatPct(-0.3505)).toBe("-35,0%");
    expect(formatFte(2.456)).toBe("2,5");
    expect(formatMonth("2027-07")).toBe("jul 2027");
    expect(formatAxisMonth("2028-03")).toBe("mrt '28");
  });

  it("translates unit suffixes", () => {
    setLang("nl");
    expect(formatByUnit(25000, "EUR/month")).toBe("EUR 25.000 per maand");
    expect(formatByUnit(90, "months")).toBe("90 maanden");
  });

  it("keeps the English formats in English", () => {
    expect(locale()).toBe("en-GB");
    expect(formatEur(1234567.8)).toBe("EUR 1,234,568");
  });
});
