# Bundled report fonts (SIL Open Font License 1.1)

The PDF reports embed only these fonts, so a report looks the same in CI and in
production and never depends on what fontconfig finds on the server. They are
loaded through `@font-face` by the local-only URL fetcher in `app/reports/render.py`
under private family names (`KS Rubik`, `KS Noto Sans Hebrew`, `KS Noto Sans Arabic`).

| File | Family | Version | Source (github.com/google/fonts) | SHA-256 |
|---|---|---|---|---|
| `Rubik-VF.ttf` | Rubik (variable `wght`; Latin + Hebrew) | 2.300 | `ofl/rubik/Rubik[wght].ttf` @ `7085eb89a950e85db5b166b7a58d414544b4140c` | `1b3a7437ba2af80e465e773ed60c5036d1ba6ace492d89046dbcf18fb31e4e88` |
| `NotoSansHebrew-VF.ttf` | Noto Sans Hebrew (variable `wdth,wght`) | 3.001 | `ofl/notosanshebrew/NotoSansHebrew[wdth,wght].ttf` @ `7085eb89a950e85db5b166b7a58d414544b4140c` | `7ef36a2c3593758cdb622e1bdef4f84523e92fbc3ccc667438dd80ff54c2de88` |
| `NotoSansArabic-VF.ttf` | Noto Sans Arabic (variable `wdth,wght`) | 2.004 | `ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf` @ `8502218d8b7493219c6bacd1f20ff7534583f19e` | `0034c0191a40ff93d03409e666be59c1dbb5b7a54f0e300a864b588ba850ad5b` |

The files are unmodified; only the file names differ (no brackets in URLs). The
licences are `OFL-Rubik.txt`, `OFL-NotoSansHebrew.txt` and `OFL-NotoSansArabic.txt`,
copied from the same revisions.

**Why Noto Sans Arabic 2.004 and not the current 2.012.** From 2.010 on, Noto Sans
Arabic draws every dotted letter as a dotless base glyph plus separate dot glyphs
(e.g. `uni066E.medi` + `dotbelowar` for a medial beh). A PDF maps text per glyph
(ToUnicode), and the same dot glyph is shared by many letters, so copy and paste,
search, screen readers and text extraction of such a PDF return wrong Arabic
letters. Version 2.004 uses one precomposed glyph per letter form (initial, medial,
final, isolated), which maps back to the right letter. The shaping (joined, never
isolated letters) is identical. `tests/test_reports_rtl.py` checks both.

WeasyPrint instances the variable fonts at the weights used (400 and 700) and
embeds subsets only.
