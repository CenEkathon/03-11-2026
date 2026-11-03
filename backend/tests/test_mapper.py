from strategy_compiler.contracts import Taxonomy
from strategy_compiler.skills.mapper import (
    CONFIDENCE,
    MAPPING_THRESHOLD,
    SkillMatcher,
    load_taxonomy,
    map_text,
    normalise_text,
)


def _by_skill(mappings):
    return {m.skill_id: m for m in mappings if m.skill_id is not None}


def test_threshold_and_confidence_constants():
    assert MAPPING_THRESHOLD == 0.6
    assert CONFIDENCE == {
        "alias_title": 0.9,
        "alias_description": 0.7,
        "generic_title": 0.55,
        "generic_description": 0.5,
    }
    assert CONFIDENCE["generic_title"] < MAPPING_THRESHOLD
    assert CONFIDENCE["generic_description"] < MAPPING_THRESHOLD


def test_taxonomy_loads_and_has_unique_ids():
    tax = load_taxonomy()
    assert isinstance(tax, Taxonomy)
    ids = [s.id for s in tax.skills]
    assert len(ids) == len(set(ids))
    assert all(s.esco_uri is None for s in tax.skills), "never invent ESCO URIs"


def test_english_title_alias_keeps_original_phrase_and_confidence(taxonomy):
    res = _by_skill(map_text("Data Engineer, Azure cloud", "title", taxonomy, posting_id="p1"))
    assert res["data_engineering"].original_phrase == "Data Engineer"
    assert res["data_engineering"].confidence == 0.9
    assert res["data_engineering"].method == "alias_title"
    assert res["data_engineering"].posting_id == "p1"
    assert res["cloud_data_platforms"].original_phrase == "Azure"


def test_dutch_description_alias(taxonomy):
    res = _by_skill(map_text("Ervaring met klantenonderzoek en transactiemonitoring.", "description", taxonomy))
    assert res["kyc"].original_phrase == "klantenonderzoek"
    assert res["kyc"].confidence == 0.7
    assert res["kyc"].method == "alias_description"
    assert res["aml_monitoring"].original_phrase == "transactiemonitoring"


def test_french_description_multiword_alias(taxonomy):
    res = _by_skill(map_text("Expérience en lutte anti-blanchiment requise", "description", taxonomy))
    assert res["aml_monitoring"].original_phrase == "lutte anti-blanchiment"
    assert res["aml_monitoring"].confidence == 0.7


def test_generic_alias_alone_stays_unmapped(taxonomy):
    res = map_text("Strong focus on compliance matters", "description", taxonomy)
    assert res, "sub-threshold match is still returned for counting"
    assert all(m.skill_id is None for m in res)
    compliance = res[0]
    assert compliance.original_phrase == "compliance"
    assert compliance.method == "generic_description"
    assert compliance.confidence == 0.5
    assert compliance.confidence < MAPPING_THRESHOLD


def test_generic_title_alone_is_still_below_threshold(taxonomy):
    res = map_text("Compliance Officer", "title", taxonomy)
    assert all(m.skill_id is None for m in res)
    assert res[0].method == "generic_title"
    assert res[0].confidence == 0.55


def test_title_beats_description_for_same_skill(taxonomy):
    res = map_text("Python developer", "title", taxonomy)
    assert [m.confidence for m in res if m.skill_id == "python"] == [0.9]
    both = map_text("Python", "title", taxonomy) + map_text("Python used daily", "description", taxonomy)
    best = max((m for m in both if m.skill_id == "python"), key=lambda m: m.confidence)
    assert best.method == "alias_title"


def test_word_boundaries_for_short_aliases(taxonomy):
    assert "sql" not in _by_skill(map_text("sqlite and sailing", "description", taxonomy))
    assert "artificial_intelligence" not in _by_skill(map_text("sailing and fail", "description", taxonomy))
    assert "sql" in _by_skill(map_text("Solid SQL skills", "description", taxonomy))


def test_matcher_is_consistent_with_map_text(taxonomy):
    matcher = SkillMatcher(taxonomy)
    text = "Azure data engineer with KYC and Python"
    via_matcher = matcher.map_text(text, "title")
    via_function = map_text(text, "title", taxonomy)
    assert [(m.skill_id, m.original_phrase, m.confidence) for m in via_matcher] == [
        (m.skill_id, m.original_phrase, m.confidence) for m in via_function
    ]


def test_normalise_html_entities_and_tags():
    assert normalise_text("&lt;br&gt;Data&amp;nbsp;engineer") == "Data engineer"
    assert normalise_text("Risk &amp;amp; control") == "Risk & control"


def test_normalise_mojibake_and_special_characters():
    assert normalise_text("lâ€™entreprise") == "l'entreprise"
    assert normalise_text("RenÃ© est prÃ©sent") == "René est présent"
    assert normalise_text("bad � char") == "bad char"
    assert normalise_text("range 2021\\u2013 2022") == "range 2021– 2022"


def test_normalise_drops_lone_surrogates_and_nbsp():
    assert normalise_text("a\ud800b\xa0c") == "ab c"


def test_normalise_handles_empty_input():
    assert normalise_text(None) == ""
    assert normalise_text("   ") == ""
