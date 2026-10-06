"""The source registries are anchored to the source documents (SPEC-UPDATE step 10).

test_coverage_matrix.py checks registry <-> matrix <-> code; this test closes the loop to the
two documents themselves (docs/mvp-refocus/parents-intake-questionnaire.md and
observation-model.md): every Hebrew fragment of every line (split on the checkboxes, the
"_____" blanks, the table pipes and the separators of joined questions and option lists) must
appear in the registries' ``source_he`` texts or in the Hebrew option labels. A question or
indicator left out of the registry (and therefore out of the matrix) fails here.

The document title and a table header are not registry rows; they are listed in ALLOWED_RAW.
"""
import json
import re

from app import vocab
from app.config import APP_DIR

REPO = APP_DIR.parent.parent
DOCS = REPO / "docs" / "mvp-refocus"
SOURCE_DOCS = ("parents-intake-questionnaire.md", "observation-model.md")
SOURCE = APP_DIR / "data" / "source"
HEBREW = re.compile("[א-ת]")
HEART = ("❤️", "❤")
CHECKBOX = "☐"
# Option lists ("a, b or c") and joined questions ("When? With whom?") are split into one part each.
PART_SEPARATORS = re.compile(r"[?;,.!]|\s/\s|\sו?או\s")

# Fragments that are not registry rows, with the reason (compared after normalize()).
ALLOWED_RAW = {
    # observation-model.md: the document title after its comma (the registry meta holds the
    # product's own title)
    "הערכה ותוכנית התערבות"
    "לילד בגיל הרך – 3–5 שנים",
    # observation-model.md, Domain 11: the header of the stage column ("stage of the day")
    "שלב ביום",
}


def normalize(text: str) -> str:
    """Comparable text: no niqqud, no quotes, no punctuation, one kind of dash, single spaces."""
    text = re.sub("[֑-ֽֿ-ׇ]", "", text)  # niqqud and cantillation, not the maqaf
    text = re.sub("[\"'`׳״‘’“”]", "", text)
    text = re.sub("[־‐-―-]", "-", text)
    text = re.sub("[:?!.,;()*…]", " ", text)
    text = re.sub(r"\s*-\s*", "-", text)
    return re.sub(r"\s+", " ", text).strip()


ALLOWED = {normalize(t) for t in ALLOWED_RAW}


def _strip_numbering(fragment: str) -> str:
    """Question and section numbers ("12. ", "א. ") are not part of the text."""
    return re.sub(r"^\s*(\d{1,2}|[א-ת]{1,2})[.)]\s+", "", fragment)


def fragments(path) -> list[str]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or line.startswith("_"):  # the markdown title and the extraction note
            continue
        for cell in re.split(CHECKBOX + r"|_{2,}|\s\|\s?|^\|\s?|\s\|$", line):
            for heart in HEART:
                cell = cell.replace(heart, "")
            for part in PART_SEPARATORS.split(_strip_numbering(cell)):
                norm = normalize(part)
                if len(norm) >= 2 and HEBREW.search(norm):
                    out.append(norm)
    return list(dict.fromkeys(out))


def _source_texts(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "source_he" and isinstance(value, str):
                yield value
            else:
                yield from _source_texts(value)
    elif isinstance(node, list):
        for value in node:
            yield from _source_texts(value)


def haystack() -> str:
    texts = []
    for path in sorted(SOURCE.glob("*.json")):
        texts += list(_source_texts(json.loads(path.read_text(encoding="utf-8"))))
    for options in vocab.lists().values():
        for option in options:
            label = option.get("label") if isinstance(option, dict) else None
            if isinstance(label, dict) and isinstance(label.get("he"), str):
                texts.append(label["he"])
    return "\n".join(normalize(t) for t in texts)


def test_every_source_line_is_in_a_registry():
    hay = haystack()
    missing = []
    for name in SOURCE_DOCS:
        path = DOCS / name
        assert path.is_file(), f"{path} is missing (deploy/ci/remote-test.sh uploads it)"
        found = fragments(path)
        assert len(found) > 50, name
        for fragment in found:
            if fragment in ALLOWED or fragment in hay:
                continue
            missing.append(f"{name}: {fragment}")
    assert not missing, f"{len(missing)} source fragments are in no registry:\n" + "\n".join(missing)


def test_the_normalisation_keeps_words_and_drops_punctuation():
    seeing = "מה בדיוק אנו רואים"
    assert normalize(seeing + "?:") == seeing
    words = "ב־3–5 מילים"
    assert normalize(words) == normalize(words.replace("־", "-").replace("–", "-"))


def test_a_missing_question_would_be_found():
    """The check is not vacuous: a made-up question is in no registry."""
    made_up = normalize("מה הצבע האהוב עליו?")
    assert made_up not in haystack()
