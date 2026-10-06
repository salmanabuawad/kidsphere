"""Report strings and formatting (dates, months, ages) in en / ar / he.

``messages/<lang>.json`` hold every fixed report string: report titles, section
and column headings, markers ("Not answered"), the PDF source labels and the
footer disclaimer (verbatim from docs/terminology.md). Option labels come from
``app.vocab`` and question labels from the source registries, never from here.
``tests/test_reports_builders.py`` checks key parity and the banned terms.

    tr = Translator("he")
    tr("markers.not_answered")                       -> "לא נענה"
    tr("sources.ai_approved", name="Rana", date=...) -> interpolated
    tr.date(value)        d.M.yyyy (he/ar) or "6 Oct 2026" (en); Western digits
    tr.month(2026, 10)    "October 2026" / "אוקטובר 2026" / "أكتوبر 2026"
    tr.age(4, 2)          "4 years, 2 months" / "4 שנים ו-2 חודשים" / "4 سنوات وشهران"

Datetimes are shown as dates in the kindergarten's time zone (``LOCAL_TZ``).
A missing key falls back to English, then to the key itself (never a crash).
"""
import json
import re
from datetime import date, datetime, timezone
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

LANGS = ("en", "ar", "he")
RTL_LANGS = frozenset({"ar", "he"})
LOCAL_TZ = ZoneInfo("Asia/Jerusalem")
MESSAGES_DIR = Path(__file__).resolve().parent / "messages"

_VAR = re.compile(r"\{(\w+)\}")


@lru_cache(maxsize=len(LANGS))
def messages(lang: str) -> dict:
    return json.loads((MESSAGES_DIR / f"{lang}.json").read_text(encoding="utf-8"))


def flatten(data: dict, prefix: str = "") -> dict[str, object]:
    """{"a": {"b": "x"}} -> {"a.b": "x"} (lists are kept as values)."""
    out: dict[str, object] = {}
    for key, value in data.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            out.update(flatten(value, path))
        else:
            out[path] = value
    return out


def direction(lang: str) -> str:
    return "rtl" if lang in RTL_LANGS else "ltr"


def to_date(value) -> date | None:
    """A date from a date, a datetime (converted to LOCAL_TZ) or an ISO string; None otherwise."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(LOCAL_TZ).date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip()
        try:
            if len(text) > 10:
                return to_date(datetime.fromisoformat(text.replace("Z", "+00:00")))
            return date.fromisoformat(text)
        except ValueError:
            return None
    return None


def _plural_category(lang: str, n: int) -> str:
    if lang == "ar":
        if n == 1:
            return "one"
        if n == 2:
            return "two"
        if 3 <= n % 100 <= 10:
            return "few"
        if 11 <= n % 100 <= 99:
            return "many"
        return "other"
    if lang == "he":
        return {1: "one", 2: "two"}.get(n, "other")
    return "one" if n == 1 else "other"


class Translator:
    def __init__(self, lang: str):
        self.lang = lang if lang in LANGS else "en"
        self.dir = direction(self.lang)
        self._own = flatten(messages(self.lang))
        self._en = flatten(messages("en"))

    def raw(self, key: str):
        return self._own.get(key, self._en.get(key))

    def has(self, key: str) -> bool:
        return key in self._own or key in self._en

    def __call__(self, key: str, **variables) -> str:
        text = self.raw(key)
        if not isinstance(text, str):
            return key
        if not variables:
            return text
        return _VAR.sub(lambda m: str(variables[m[1]]) if m[1] in variables else m[0], text)

    def date(self, value) -> str:
        d = to_date(value)
        if d is None:
            return ""
        months = self.raw("date.months_short") or []
        mon = months[d.month - 1] if len(months) == 12 else str(d.month)
        return self("date.format", d=d.day, m=d.month, y=d.year, mon=mon)

    def month(self, year: int, month: int) -> str:
        months = self.raw("date.months") or []
        name = months[month - 1] if len(months) == 12 else str(month)
        return self("date.month_year", month=name, year=year)

    def count_word(self, unit: str, n: int) -> str:
        """``unit`` is "year" or "month": "4 years", "שנתיים", "3 أشهر"."""
        category = _plural_category(self.lang, n)
        key = f"age.{unit}_{category}"
        if not self.has(key):
            key = f"age.{unit}_other"
        return self(key, n=n)

    def age(self, years: int, months: int) -> str:
        if years <= 0 and months <= 0:
            return self.count_word("month", 0)
        if months <= 0:
            return self.count_word("year", years)
        if years <= 0:
            return self.count_word("month", months)
        y, m = self.count_word("year", years), self.count_word("month", months)
        joiner = self("age.join_digit") if m[:1].isdigit() else self("age.join")
        return self("age.both", years=y, join=joiner, months=m)
