/*
 * Runs synchronously in <head> before first paint: sets <html lang dir> from the
 * saved interface language so RTL pages never flash LTR. Kept as an external
 * file because the CSP is script-src 'self' (no inline scripts).
 */
(function () {
  var locale = "ar";
  try {
    var saved = window.localStorage.getItem("ks_locale");
    if (saved === "ar" || saved === "he" || saved === "en") locale = saved;
  } catch (e) {
    /* storage blocked: keep the default */
  }
  var html = document.documentElement;
  html.lang = locale;
  html.dir = locale === "en" ? "ltr" : "rtl";
})();
