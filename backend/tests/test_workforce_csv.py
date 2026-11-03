"""The synthetic workforce is read from fixtures/workforce.csv. These tests guard the format and the loader."""

import pytest

from strategy_compiler.config import FIXTURES_DIR, load_employees, parse_workforce_csv

HEADER = "employee_id,team_id,role,grade,fte,availability,cost_band,is_mock,skills_json,training_json\n"


def test_committed_csv_has_300_synthetic_employees_with_no_extra_attributes():
    employees = load_employees()
    assert len(employees) == 300
    assert all(e.is_mock for e in employees)
    assert len({e.employee_id for e in employees}) == 300


def test_committed_csv_header_has_no_name_or_sensitive_columns():
    header = (FIXTURES_DIR / "workforce.csv").read_text(encoding="utf-8").splitlines()[0]
    forbidden = {"name", "first_name", "last_name", "email", "gender", "age", "date_of_birth", "nationality", "salary"}
    assert forbidden.isdisjoint(c.strip() for c in header.split(","))


def test_parses_json_cells_into_skills_and_training():
    row = (
        'EMP-9001,AML-OPS,KYC analyst,G5,0.8,0.4,B,true,'
        '"{""kyc"": 4, ""python"": 2}",'
        '"[{""course_id"": ""CRS-PY-01"", ""course_label"": ""Python"", ""completed"": ""2025-03"", ""days"": 3.0}]"\n'
    )
    (employee,) = parse_workforce_csv(HEADER + row)
    assert employee.skills == {"kyc": 4, "python": 2}
    assert employee.fte == 0.8
    assert employee.availability == 0.4
    assert employee.training_history[0].course_id == "CRS-PY-01"


def test_rejects_is_mock_other_than_true_or_false():
    row = 'EMP-9002,AML-OPS,KYC analyst,G5,1,0.4,B,yes,"{}",[]\n'
    with pytest.raises(ValueError, match="is_mock"):
        parse_workforce_csv(HEADER + row)


def test_rejects_out_of_range_availability():
    row = 'EMP-9003,AML-OPS,KYC analyst,G5,1,1.4,B,true,"{}",[]\n'
    with pytest.raises(ValueError):
        parse_workforce_csv(HEADER + row)
