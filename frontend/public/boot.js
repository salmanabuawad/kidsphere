/*
 * Runs synchronously in <head> before first paint: sets <html lang dir> so RTL pages never
 * flash LTR. Kept as an external file because the CSP is script-src 'self' (no inline scripts).
 * Each entrance (src/lib/brand.ts) starts in its own language and remembers a switch for itself:
 * /sharnaqa Arabic (ks_locale_sharnaqa), /nitzanim Hebrew (ks_locale_nitzanim); elsewhere
 * (the chooser) the saved ks_locale, else Arabic.
 */
(function () {
  var first = (window.location.pathname.split("/")[1] || "").toLowerCase();
  var brand = first === "sharnaqa" || first === "nitzanim" ? first : null;
  var locale = brand === "nitzanim" ? "he" : "ar";
  try {
    var saved = window.localStorage.getItem(brand ? "ks_locale_" + brand : "ks_locale");
    if (saved === "ar" || saved === "he" || saved === "en") locale = saved;
  } catch (e) {
    /* storage blocked: keep the entrance's language */
  }
  var html = document.documentElement;
  html.lang = locale;
  html.dir = locale === "en" ? "ltr" : "rtl";
})();
