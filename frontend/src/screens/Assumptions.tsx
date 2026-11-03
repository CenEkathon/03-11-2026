import { useState } from "react";
import { Callout, Card, DataTable, PageHeader, type Column } from "../components/ui";
import type { Controls, Shared } from "../appTypes";
import type { AssumptionRow } from "../api/types";
import { formatByUnit } from "../lib/format";
import { t } from "../i18n/i18n";
import { useLang } from "../i18n/LanguageProvider";

const CONFIDENCE_TEXT: Record<AssumptionRow["confidence"], string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export function Assumptions({ shared, controls }: { shared: Shared; controls: Controls }) {
  useLang();
  const { assumptions } = shared;
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(controls.overrides).map(([k, v]) => [k, String(v)])),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const activeOverrides = Object.keys(controls.overrides).length;

  const numericDrafts = (): Record<string, number> =>
    Object.fromEntries(
      Object.entries(drafts)
        .filter(([, v]) => v.trim() !== "" && !Number.isNaN(Number(v)))
        .map(([k, v]) => [k, Number(v)]),
    );

  const apply = async () => {
    setBusy(true);
    const result = await controls.applyAssumptions(numericDrafts());
    setBusy(false);
    setErrors(result ?? []);
  };

  const clear = async () => {
    setDrafts({});
    setBusy(true);
    const result = await controls.applyAssumptions({});
    setBusy(false);
    setErrors(result ?? []);
  };

  const columns: Column<AssumptionRow>[] = [
    {
      key: "label",
      header: t("Assumption"),
      render: (a) => (
        <>
          <div className="cell-title">{t(a.label)}</div>
          <div className="muted small">{t(a.rationale)}</div>
          <code className="small">{a.key}</code>
        </>
      ),
    },
    { key: "low", header: t("Low"), numeric: true, render: (a) => formatByUnit(a.low, a.unit) },
    { key: "base", header: t("Base"), numeric: true, render: (a) => <strong>{formatByUnit(a.base, a.unit)}</strong> },
    { key: "high", header: t("High"), numeric: true, render: (a) => formatByUnit(a.high, a.unit) },
    { key: "conf", header: t("Confidence"), render: (a) => t(CONFIDENCE_TEXT[a.confidence]) },
    {
      key: "override",
      header: t("Your base value"),
      render: (a) => (
        <div className="override">
          <input
            type="number"
            step="any"
            inputMode="decimal"
            aria-label={t("Your base value for {label} ({unit})", { label: t(a.label), unit: t(a.unit) })}
            value={drafts[a.key] ?? ""}
            placeholder={String(a.base)}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [a.key]: e.target.value }))}
          />
          <span className="muted small">{a.unit === "share" ? t("decimal, 0.35 = 35%") : t(a.unit)}</span>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("Assumptions")}
        lead={t("The inputs behind every cost and benefit. Change a base value and the whole demo recalculates. Changes are not saved on the server.")}
      />

      <Callout tone="info" title={t("How to read this table")}>
        <strong>{t("Low")}</strong>{" "}
        {t("is the conservative case: higher costs, lower benefit.")} <strong>{t("High")}</strong>{" "}
        {t("is the optimistic case. Your base value replaces the base case only. The Low and High columns stay as the sensitivity range.")}
      </Callout>

      <Card
        title={t("Inputs")}
        description={
          activeOverrides === 1
            ? t("1 base value overridden. Leave a field empty to keep the base value.")
            : t("{count} base values overridden. Leave a field empty to keep the base value.", { count: activeOverrides })
        }
        actions={
          <div className="action-bar action-bar-inline">
            <button type="button" className="btn btn-primary" onClick={apply} disabled={busy}>
              {busy ? t("Recalculating…") : t("Apply values")}
            </button>
            <button type="button" className="btn" onClick={clear} disabled={busy}>
              {t("Reset all")}
            </button>
          </div>
        }
      >
        {errors.length > 0 ? (
          <div className="stack-sm">
            <Callout tone="critical" title={t("Some values were rejected. The results on screen are unchanged.")}>
              <ul className="error-list">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          </div>
        ) : null}
        <DataTable
          caption={t("Assumptions with low, base and high values")}
          columns={columns}
          rows={assumptions}
          rowKey={(a) => a.key}
        />
      </Card>
    </>
  );
}
