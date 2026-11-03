import json
from datetime import date
from pathlib import Path

import duckdb
import pytest

from strategy_compiler.etl.vacancies_etl import (
    is_intermediary,
    normalise_company,
    run_etl,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REAL_PARQUET = REPO_ROOT / "data" / "vacancies_2021.parquet"
COMPANY_NAMES_IN_TOY_DATA = ["barclays", "kbc", "stepstone", "abn amro"]

TOY_ROWS = [
    # exact repost of row 2 once company case is normalised -> collapses to one posting
    ("1", "Data Engineer", "Azure and SQL experience required, Python.", "Barclays", date(2021, 3, 4), "GB", "London"),
    ("2", "Data Engineer", "Azure and SQL experience required, Python.", "barclays", date(2021, 3, 4), "GB", "London"),
    ("3", "Model Validator", "Ervaring met modelvalidatie en explainability.", "Barclays", date(2021, 4, 1), "GB", "London"),
    # null date: excluded from monthly evidence, still counted as a deduped posting
    ("4", "AML analyst", "Klantenonderzoek en witwassen", "KBC", None, "BE", "Brussel"),
    # intermediary: flagged, not dropped
    ("5", "Sales role", "Sales and customer contact", "StepStone", date(2021, 4, 1), "BE", "Antwerpen"),
    # generic alias only: no skill mapping
    ("6", "Officer", "Strong focus on compliance matters", "ING", date(2021, 4, 1), "NL", "Amsterdam"),
    # company variants with different text: normalised company merges, text does not
    ("7", "Credit risk analyst", "Credit risk modelling", "ABN AMRO Bank N.V.", date(2021, 5, 1), "NL", "Amsterdam"),
    ("8", "Credit risk analyst 2", "Credit risk modelling again", "ABN AMRO", date(2021, 5, 1), "NL", "Amsterdam"),
]


def _write_parquet(path: Path, rows) -> None:
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE v (vacancy_id VARCHAR, title VARCHAR, description VARCHAR, "
        "company VARCHAR, date_posted DATE, country VARCHAR, city VARCHAR)"
    )
    con.executemany("INSERT INTO v VALUES (?,?,?,?,?,?,?)", rows)
    con.execute(f"COPY v TO '{path.as_posix()}' (FORMAT PARQUET)")
    con.close()


@pytest.fixture
def toy_run(tmp_path, taxonomy):
    src = tmp_path / "toy.parquet"
    _write_parquet(src, TOY_ROWS)
    committed = tmp_path / "committed"
    report = run_etl(src, tmp_path / "derived", committed, taxonomy=taxonomy, min_cell_postings=1)
    evidence = json.loads((committed / "vacancy_evidence.json").read_text(encoding="utf-8"))
    return report, evidence, committed, tmp_path / "derived"


def test_normalise_company_merges_case_and_legal_suffixes():
    assert normalise_company("Barclays") == normalise_company("barclays") == "barclays"
    assert normalise_company("ABN AMRO Bank N.V.") == normalise_company("ABN AMRO") == "abn amro"
    assert normalise_company("ING Netherlands") == "ing"
    assert normalise_company("Lloyds Banking Group") == "lloyds banking"


def test_intermediary_detection():
    assert is_intermediary(normalise_company("StepStone"))
    assert is_intermediary(normalise_company("Start People BV"))
    assert not is_intermediary(normalise_company("KBC"))


def test_exact_repost_collapses_to_one_posting(toy_run):
    report, _, _, _ = toy_run
    assert report["raw_rows"] == 8
    assert report["duplicates_removed"] == 1
    assert report["deduped_postings"] == 7


def test_company_variants_merge_in_normalised_count(toy_run):
    report, _, _, _ = toy_run
    assert report["companies"]["raw_distinct"] == 7
    assert report["companies"]["normalised_distinct"] == 5


def test_null_date_excluded_from_monthly_evidence_but_counted(toy_run):
    report, evidence, _, _ = toy_run
    assert report["null_date_postings_deduped"] == 1
    assert not any(r["country"] == "BE" for r in evidence["rows"]), "null-date BE posting must not form a cell"


def test_intermediary_flagged_not_dropped(toy_run):
    report, _, _, _ = toy_run
    assert report["intermediary_postings_deduped"] == 1
    assert report["deduped_postings"] == 7  # StepStone posting is still in the deduped set


def test_generic_only_match_is_not_evidence(toy_run):
    report, evidence, _, _ = toy_run
    assert report["sub_threshold_matches_by_method"].get("generic_description", 0) >= 1
    assert all(r["skill_id"] != "ai_governance" for r in evidence["rows"]), "generic 'compliance' must not become evidence"


def test_evidence_cell_shares_use_deduped_dated_denominator(toy_run):
    _, evidence, _, _ = toy_run
    gb_de = [r for r in evidence["rows"] if r["skill_id"] == "data_engineering" and r["country"] == "GB"]
    assert len(gb_de) == 1
    assert gb_de[0]["year_month"] == "2021-03"
    assert gb_de[0]["postings"] == 1  # the repost was removed
    assert gb_de[0]["postings_in_cell"] == 1
    assert gb_de[0]["share"] == 1.0
    assert gb_de[0]["sample_vacancy_ids"] == ["1"]


def test_committed_outputs_contain_no_company_names(toy_run):
    _, _, committed, _ = toy_run
    for name in ("evidence", "report"):
        text = (committed / f"vacancy_evidence{'' if name == 'evidence' else '_report'}.json").read_text(encoding="utf-8").lower()
        for company in COMPANY_NAMES_IN_TOY_DATA:
            assert company not in text, f"{company!r} leaked into committed {name} output"


def test_derived_parquet_outputs_written(toy_run):
    _, _, _, derived = toy_run
    assert (derived / "vacancy_skill_evidence.parquet").exists()
    assert (derived / "postings_skill_mappings.parquet").exists()
    con = duckdb.connect()
    n = con.execute(f"SELECT COUNT(*) FROM read_parquet('{(derived / 'postings_skill_mappings.parquet').as_posix()}')").fetchone()[0]
    con.close()
    assert n > 0


def test_committed_fixture_has_no_company_key_if_present():
    path = REPO_ROOT / "backend" / "strategy_compiler" / "fixtures" / "vacancy_evidence.json"
    if not path.exists():
        pytest.skip("committed evidence not generated yet")
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert doc["period"] == "2021"
    assert all("company" not in row for row in doc["rows"])
    assert all(row["postings"] >= doc["min_cell_postings"] for row in doc["rows"])


@pytest.mark.slow
def test_real_parquet_etl_end_to_end(tmp_path, taxonomy):
    if not REAL_PARQUET.exists():
        pytest.skip("data/vacancies_2021.parquet not present")
    report = run_etl(REAL_PARQUET, tmp_path / "derived", tmp_path / "committed", taxonomy=taxonomy)
    assert report["raw_rows"] == 116927
    assert report["duplicates_removed"] + report["deduped_postings"] == report["raw_rows"]
    assert report["duplicates_removed"] > 0
    assert 0.0 < report["mapping_coverage"] <= 1.0
    doc = json.loads((tmp_path / "committed" / "vacancy_evidence.json").read_text(encoding="utf-8"))
    assert doc["rows"], "expected at least one evidence cell"
    text = (tmp_path / "committed" / "vacancy_evidence.json").read_text(encoding="utf-8")
    assert "\"company\"" not in text
