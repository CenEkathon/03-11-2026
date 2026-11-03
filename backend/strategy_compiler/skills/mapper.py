"""Rule-based skill mapper: alias matching against the curated taxonomy (EN/NL/FR).

Rules (deterministic, auditable):
- Case-insensitive, token-level matching of every alias. Tokens are word characters or
  single punctuation marks, so word boundaries are respected by construction
  (e.g. "sql" does not match "sqlite", "ai" does not match "sail").
- Confidence: alias in title 0.9, alias in description 0.7,
  generic alias in title 0.55, generic alias in description 0.5.
- Best confidence is kept per skill per text.
- Matches below MAPPING_THRESHOLD are never forced onto a skill: they are returned with
  skill_id=None and the generic_* method, so they can be counted but not used.
"""

from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Literal

from strategy_compiler.contracts import SkillMapping, Taxonomy

MAPPING_THRESHOLD = 0.6

CONFIDENCE: dict[str, float] = {
    "alias_title": 0.9,
    "alias_description": 0.7,
    "generic_title": 0.55,
    "generic_description": 0.5,
}

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
TAXONOMY_PATH = FIXTURES_DIR / "taxonomy.json"

# Mojibake repairs (UTF-8 bytes decoded as cp1252). Longest first.
_MOJIBAKE: list[tuple[str, str]] = [
    ("â€™", "'"),  # right single quote
    ("â€˜", "'"),  # left single quote
    ("â€œ", '"'),  # left double quote
    ("â€\u009d", '"'),  # right double quote (stray \x9d)
    ("â€“", "–"),  # en dash
    ("â€”", "—"),  # em dash
    ("â€¦", "…"),  # ellipsis
    ("â€¢", "•"),  # bullet
    ("Â ", " "),
    ("Ã©", "é"),  # e acute
    ("Ã¨", "è"),  # e grave
    ("Ã«", "ë"),  # e diaeresis
    ("Ãª", "ê"),  # e circumflex
    ("Ã¯", "ï"),  # i diaeresis
    ("Ã¶", "ö"),  # o diaeresis
    ("Ã¼", "ü"),  # u diaeresis
    ("Ã§", "ç"),  # c cedilla
    ("Ã ", "à"),  # a grave
    ("Â", ""),  # stray capital A-circumflex
]

_TAG_RE = re.compile(r"</?[a-zA-Z][^>]{0,200}>")
_UNICODE_ESCAPE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")
_SURROGATE_RE = re.compile("[\ud800-\udfff]")  # lone surrogates break UTF-8 encoding
_WS_RE = re.compile(r"\s+")
_TOKEN_RE = re.compile(r"\w+|[^\w\s]")


def normalise_text(text: str | None) -> str:
    """Decode entities, strip markup, repair common mojibake, collapse whitespace."""
    if not text:
        return ""
    s = html.unescape(html.unescape(text))
    s = _TAG_RE.sub(" ", s)
    s = _UNICODE_ESCAPE_RE.sub(lambda m: chr(int(m.group(1), 16)), s)
    for bad, good in _MOJIBAKE:
        if bad in s:
            s = s.replace(bad, good)
    s = _SURROGATE_RE.sub("", s)
    s = s.replace("�", "").replace("\xa0", " ").replace("&nbsp;", " ")
    return _WS_RE.sub(" ", s).strip()


def load_taxonomy(path: Path | None = None) -> Taxonomy:
    raw = json.loads((path or TAXONOMY_PATH).read_text(encoding="utf-8"))
    return Taxonomy.model_validate(raw)


def _alias_tokens(alias: str) -> tuple[str, ...]:
    return tuple(m.group(0) for m in _TOKEN_RE.finditer(alias.lower()))


class SkillMatcher:
    """Indexes all aliases of a taxonomy by token sequence and matches texts in one pass."""

    def __init__(self, taxonomy: Taxonomy):
        index: dict[tuple[str, ...], set[tuple[str, bool]]] = {}
        for skill in taxonomy.skills:
            for aliases in skill.aliases.values():
                for alias in aliases:
                    index.setdefault(_alias_tokens(alias), set()).add((skill.id, False))
            for aliases in skill.generic_aliases.values():
                for alias in aliases:
                    index.setdefault(_alias_tokens(alias), set()).add((skill.id, True))
        self._index: dict[tuple[str, ...], list[tuple[str, bool]]] = {
            k: sorted(v) for k, v in index.items() if k
        }
        self._first: dict[str, list[int]] = {}
        for key in self._index:
            self._first.setdefault(key[0], []).append(len(key))
        for lengths in self._first.values():
            lengths.sort(reverse=True)  # longest match first

    def map_normalised(
        self,
        clean: str,
        field: Literal["title", "description"],
        posting_id: str | None = None,
    ) -> list[SkillMapping]:
        """Map text that is already normalised with normalise_text()."""
        if not clean:
            return []
        words = _TOKEN_RE.findall(clean.lower())
        spans: list[tuple[int, int]] | None = None
        best_conf: dict[str, float] = {}
        best_phrase: dict[str, str] = {}
        best_method: dict[str, str] = {}
        n = len(words)
        for i, word in enumerate(words):
            lengths = self._first.get(word)
            if lengths is None:
                continue
            for k in lengths:
                if i + k > n:
                    continue
                entries = self._index.get(tuple(words[i : i + k]))
                if not entries:
                    continue
                if spans is None:
                    spans = [m.span() for m in _TOKEN_RE.finditer(clean)]
                if len(spans) != n:  # lower() changed tokenisation; fall back to lowercase phrase
                    phrase = " ".join(words[i : i + k])
                else:
                    phrase = clean[spans[i][0] : spans[i + k - 1][1]]
                for skill_id, is_generic in entries:
                    method = f"{'generic' if is_generic else 'alias'}_{field}"
                    conf = CONFIDENCE[method]
                    if conf > best_conf.get(skill_id, -1.0):
                        best_conf[skill_id] = conf
                        best_phrase[skill_id] = phrase
                        best_method[skill_id] = method
        out: list[SkillMapping] = []
        for skill_id in sorted(best_conf):
            conf = best_conf[skill_id]
            mapped = conf >= MAPPING_THRESHOLD
            out.append(
                SkillMapping(
                    original_phrase=best_phrase[skill_id],
                    skill_id=skill_id if mapped else None,
                    method=best_method[skill_id],  # type: ignore[arg-type]
                    confidence=conf,
                    posting_id=posting_id,
                )
            )
        return out

    def map_text(
        self,
        text: str | None,
        field: Literal["title", "description"],
        posting_id: str | None = None,
    ) -> list[SkillMapping]:
        return self.map_normalised(normalise_text(text), field, posting_id)


_MATCHER_CACHE: dict[int, tuple[Taxonomy, SkillMatcher]] = {}


def build_matcher(taxonomy: Taxonomy) -> SkillMatcher:
    cached = _MATCHER_CACHE.get(id(taxonomy))
    if cached is not None and cached[0] is taxonomy:
        return cached[1]
    matcher = SkillMatcher(taxonomy)
    _MATCHER_CACHE[id(taxonomy)] = (taxonomy, matcher)
    return matcher


def map_text(
    text: str | None,
    field: Literal["title", "description"],
    taxonomy: Taxonomy,
    posting_id: str | None = None,
) -> list[SkillMapping]:
    """Map one text field. Returns mapped matches plus sub-threshold matches (skill_id=None)."""
    return build_matcher(taxonomy).map_text(text, field, posting_id)
