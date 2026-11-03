"""Vacancy ETL: deduplicate and skill-map the 2021 finance/insurance job-posting sample.

External observation only. Outputs:
  A. data/derived/*.parquet          full posting-level mappings + skill x country x month cells (gitignored)
  B. fixtures/vacancy_evidence.json  aggregate evidence, cells with >= MIN_CELL_POSTINGS (committed)
  C. fixtures/vacancy_evidence_report.json  ETL report, counts only (committed)

No company names are written to B or C. Intermediaries are counted, never dropped.

Run from backend/:
  uv run python -m strategy_compiler.etl.vacancies_etl --input ../data/vacancies_2021.parquet --out-dir ../data/derived
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import duckdb

from strategy_compiler.contracts import Taxonomy, VacancyEvidence
from strategy_compiler.skills.mapper import (
    FIXTURES_DIR,
    MAPPING_THRESHOLD,
    build_matcher,
    load_taxonomy,
    normalise_text,
)

DEFAULT_INPUT = Path("../data/vacancies_2021.parquet")
DEFAULT_OUT_DIR = Path("../data/derived")
MIN_CELL_POSTINGS = 3
SAMPLE_IDS_PER_CELL = 3
FETCH_BATCH = 5000

# Conservative legal/generic suffixes, stripped only from the end of a company name, repeatedly.
LEGAL_SUFFIXES = ("nv", "bv", "plc", "ltd", "limited", "uk", "netherlands", "group", "holdings", "bank")
# Known recruiters / job boards that post on behalf of employers. Flagged only, never dropped.
INTERMEDIARIES = ("stepstone", "randstad", "hays", "youngcapital", "start people", "konvert", "xtra interim")

_WS_RE = re.compile(r"\s+")


def normalise_company(name: str | None) -> str:
    """Lowercase, drop dots/commas, strip trailing legal suffixes. Conservative by design."""
    s = normalise_text(name).lower().replace(".", "")
    s = re.sub(r"[,;:]", " ", s)
    s = _WS_RE.sub(" ", s).strip()
    changed = True
    while changed:
        changed = False
        for suffix in LEGAL_SUFFIXES:
            if s.endswith(" " + suffix):
                s = s[: -(len(suffix) + 1)].rstrip()
                changed = True
    return s


def is_intermediary(normalised_company: str) -> bool:
    return any(
        normalised_company == name or normalised_company.startswith(name + " ")
        for name in INTERMEDIARIES
    )


def dedupe_key(title_n: str, company_n: str, desc_n: str) -> str:
    raw = "\x1f".join((title_n.lower(), company_n, desc_n.lower()))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _sql_path(path: Path) -> str:
    return path.as_posix().replace("'", "''")


def run_etl(
    input_path: Path,
    out_dir: Path,
    committed_dir: Path,
    taxonomy: Taxonomy | None = None,
    min_cell_postings: int = MIN_CELL_POSTINGS,
) -> dict[str, Any]:
    taxonomy = taxonomy or load_taxonomy()
    matcher = build_matcher(taxonomy)
    family_of = {s.id: s.family for s in taxonomy.skills}

    con = duckdb.connect()
    cursor = con.execute(
        "SELECT vacancy_id, title, description, company, date_posted, country "
        "FROM read_parquet(?) ORDER BY CAST(vacancy_id AS BIGINT)",
        [str(input_path)],
    )

    raw_rows = 0
    duplicates = 0
    kept = 0
    null_dates = 0
    intermediary_postings = 0
    seen: set[str] = set()
    raw_companies: set[str] = set()
    norm_companies: set[str] = set()
    country_counts: Counter[str] = Counter()
    cell_postings: Counter[tuple[str, str]] = Counter()  # (country, ym) dated, deduped
    skill_cell: Counter[tuple[str, str, str]] = Counter()  # (skill, country, ym)
    skill_samples: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    skill_total: Counter[str] = Counter()  # deduped, dated or not
    mapped_postings = 0
    mapped_by_method: Counter[str] = Counter()
    sub_threshold_by_method: Counter[str] = Counter()
    mapping_rows: list[tuple[str, str, str, float, str]] = []

    while True:
        batch = cursor.fetchmany(FETCH_BATCH)
        if not batch:
            break
        for vid, title, desc, company, dt, country in batch:
            raw_rows += 1
            vid = str(vid)
            title_n = normalise_text(title)
            desc_n = normalise_text(desc)
            company_n = normalise_company(company)
            raw_companies.add(company or "")
            norm_companies.add(company_n)

            key = dedupe_key(title_n, company_n, desc_n)
            if key in seen:
                duplicates += 1
                continue
            seen.add(key)
            kept += 1

            country = (country or "").upper()
            country_counts[country] += 1
            if is_intermediary(company_n):
                intermediary_postings += 1
            ym = dt.isoformat()[:7] if dt is not None else None
            if ym is None:
                null_dates += 1
            else:
                cell_postings[(country, ym)] += 1

            best: dict[str, Any] = {}
            for field, text in (("title", title_n), ("description", desc_n)):
                for m in matcher.map_normalised(text, field, vid):  # type: ignore[arg-type]
                    if m.skill_id is None:
                        sub_threshold_by_method[m.method] += 1
                        continue
                    prev = best.get(m.skill_id)
                    if prev is None or m.confidence > prev.confidence:
                        best[m.skill_id] = m

            if best:
                mapped_postings += 1
            for skill_id, m in best.items():
                mapped_by_method[m.method] += 1
                skill_total[skill_id] += 1
                mapping_rows.append((vid, skill_id, m.method, m.confidence, m.original_phrase))
                if ym is not None:
                    cell = (skill_id, country, ym)
                    skill_cell[cell] += 1
                    samples = skill_samples[cell]
                    if len(samples) < SAMPLE_IDS_PER_CELL:
                        samples.append(vid)

    evidence_all: list[VacancyEvidence] = []
    evidence_committed: list[VacancyEvidence] = []
    for (skill_id, country, ym), n in sorted(skill_cell.items()):
        den = cell_postings[(country, ym)]
        ev = VacancyEvidence(
            skill_id=skill_id,
            family=family_of[skill_id],
            country=country,
            year_month=ym,
            postings=n,
            postings_in_cell=den,
            share=round(n / den, 4),
            sample_vacancy_ids=list(skill_samples[(skill_id, country, ym)]),
        )
        evidence_all.append(ev)
        if n >= min_cell_postings:
            evidence_committed.append(ev)

    out_dir.mkdir(parents=True, exist_ok=True)
    committed_dir.mkdir(parents=True, exist_ok=True)

    con.execute(
        "CREATE TABLE evidence (skill_id VARCHAR, family VARCHAR, country VARCHAR, "
        "year_month VARCHAR, postings BIGINT, postings_in_cell BIGINT, share DOUBLE, "
        "sample_vacancy_ids VARCHAR[])"
    )
    con.executemany(
        "INSERT INTO evidence VALUES (?,?,?,?,?,?,?,?)",
        [
            (e.skill_id, e.family, e.country, e.year_month, e.postings,
             e.postings_in_cell, e.share, e.sample_vacancy_ids)
            for e in evidence_all
        ],
    )
    con.execute(
        f"COPY evidence TO '{_sql_path(out_dir / 'vacancy_skill_evidence.parquet')}' (FORMAT PARQUET)"
    )

    con.execute(
        "CREATE TABLE mappings (posting_id VARCHAR, skill_id VARCHAR, method VARCHAR, "
        "confidence DOUBLE, original_phrase VARCHAR)"
    )
    if mapping_rows:
        con.executemany("INSERT INTO mappings VALUES (?,?,?,?,?)", mapping_rows)
    con.execute(
        f"COPY mappings TO '{_sql_path(out_dir / 'postings_skill_mappings.parquet')}' (FORMAT PARQUET)"
    )

    evidence_doc = {
        "label": "EXTERNAL OBSERVED - 2021 - aggregated job-posting evidence (not mock)",
        "source": (
            "Finance and insurance job postings, 2021, EN/NL/FR. Deduplicated, then mapped "
            "with the rule-based curated taxonomy. Aggregates only."
        ),
        "period": "2021",
        "min_cell_postings": min_cell_postings,
        "rows": [e.model_dump() for e in evidence_committed],
    }
    (committed_dir / "vacancy_evidence.json").write_text(
        json.dumps(evidence_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    report: dict[str, Any] = {
        "label": "EXTERNAL OBSERVED - ETL report (counts only, no employer names)",
        "source_file": input_path.name,
        "period": "2021",
        "raw_rows": raw_rows,
        "duplicates_removed": duplicates,
        "deduped_postings": kept,
        "dedupe_key": "sha1(normalised title | normalised company | normalised description), lowercased",
        "companies": {
            "raw_distinct": len(raw_companies),
            "normalised_distinct": len(norm_companies),
            "normalisation": (
                "lowercase, drop dots, strip trailing legal suffixes: "
                + ", ".join(LEGAL_SUFFIXES)
            ),
        },
        "intermediary_postings_deduped": intermediary_postings,
        "intermediary_rule": "normalised company equals or starts with a known recruiter name; flagged, not dropped",
        "null_date_postings_deduped": null_dates,
        "postings_by_country_deduped": dict(sorted(country_counts.items())),
        "postings_with_mapped_skill": mapped_postings,
        "mapping_coverage": round(mapped_postings / kept, 4) if kept else 0.0,
        "mapping_threshold": MAPPING_THRESHOLD,
        "mapped_matches_by_method": dict(sorted(mapped_by_method.items())),
        "sub_threshold_matches_by_method": dict(sorted(sub_threshold_by_method.items())),
        "skill_postings_deduped": {s.id: skill_total.get(s.id, 0) for s in taxonomy.skills},
        "skills_with_zero_matches": sorted(s.id for s in taxonomy.skills if skill_total.get(s.id, 0) == 0),
        "evidence_cells": {"all": len(evidence_all), "committed": len(evidence_committed)},
        "min_cell_postings_committed": min_cell_postings,
        "data_caveats": [
            "2021 only: a single year, not a time series of the full market.",
            "EN/NL/FR text only. Mapping uses an alias list, so other languages are not covered.",
            "Language is not tagged in the source and was not estimated.",
            "Descriptions are unstructured free text with employer boilerplate.",
            "The mapper is rule-based and transparent. Recall and precision were not measured against labels.",
            "Use shares per country-month of deduplicated dated postings, not raw counts.",
            "Describes what employers advertised in 2021. It is not workforce supply data.",
            "Company names are excluded from every committed output. Intermediaries are counted, not removed.",
        ],
    }
    (committed_dir / "vacancy_evidence_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    report["_derived"] = {
        "evidence_parquet": str(out_dir / "vacancy_skill_evidence.parquet"),
        "mappings_parquet": str(out_dir / "postings_skill_mappings.parquet"),
        "mapping_rows": len(mapping_rows),
    }
    con.close()
    return report


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--committed-dir", type=Path, default=FIXTURES_DIR)
    args = parser.parse_args(argv)

    started = time.perf_counter()
    report = run_etl(args.input, args.out_dir, args.committed_dir)
    elapsed = time.perf_counter() - started

    top = sorted(report["skill_postings_deduped"].items(), key=lambda kv: kv[1], reverse=True)[:15]
    print(f"raw rows: {report['raw_rows']}")
    print(f"duplicates removed: {report['duplicates_removed']}  ->  deduped postings: {report['deduped_postings']}")
    print(f"companies raw/normalised distinct: {report['companies']['raw_distinct']} / {report['companies']['normalised_distinct']}")
    print(f"intermediary postings (flagged): {report['intermediary_postings_deduped']}")
    print(f"null-date postings (excluded from monthly cells): {report['null_date_postings_deduped']}")
    print(f"postings with >=1 mapped skill: {report['postings_with_mapped_skill']} ({report['mapping_coverage']:.1%})")
    print(f"evidence cells: all={report['evidence_cells']['all']} committed(>= {report['min_cell_postings_committed']})={report['evidence_cells']['committed']}")
    print(f"skills with zero matches: {report['skills_with_zero_matches'] or 'none'}")
    print("top 15 skills by deduped postings:")
    for skill_id, n in top:
        print(f"  {skill_id}: {n}")
    print(f"wall-clock: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
