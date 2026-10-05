import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "@/auth/AuthProvider";
import { useI18n, I18nProvider } from "@/i18n/I18nProvider";
import { mockFetch, teacher } from "./utils";

const BOOT = readFileSync(resolve(process.cwd(), "public/boot.js"), "utf8");
const runBoot = () => new Function(BOOT)();

describe("public/boot.js", () => {
  it.each([
    ["ar", "rtl"],
    ["he", "rtl"],
    ["en", "ltr"],
  ])("sets lang=%s dir=%s from localStorage before paint", (locale, dir) => {
    window.localStorage.setItem("ks_locale", locale);
    runBoot();
    expect(document.documentElement.lang).toBe(locale);
    expect(document.documentElement.dir).toBe(dir);
  });

  it("defaults to Arabic RTL when nothing (or garbage) is stored", () => {
    runBoot();
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    window.localStorage.setItem("ks_locale", "fr");
    runBoot();
    expect(document.documentElement.lang).toBe("ar");
  });

  it("has no inline-script dependencies (plain ES5 IIFE)", () => {
    expect(BOOT).not.toMatch(/\bimport\b|\bexport\b/);
  });
});

function Probe() {
  const { locale, dir, t, setLocale } = useI18n();
  return (
    <div>
      <p data-testid="state">
        {locale}/{dir}
      </p>
      <p data-testid="text">{t("common.save")}</p>
      <button onClick={() => void setLocale("en")}>en</button>
      <button onClick={() => void setLocale("he")}>he</button>
      <button onClick={() => void setLocale("ar")}>ar</button>
    </div>
  );
}

describe("setLocale", () => {
  it("updates <html lang dir>, localStorage and the text", async () => {
    window.localStorage.setItem("ks_locale", "ar");
    runBoot();
    render(
      <AuthProvider initialUser={null}>
        <I18nProvider>
          <Probe />
        </I18nProvider>
      </AuthProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("ar/rtl");
    expect(screen.getByTestId("text").textContent).toBe("حفظ");

    await act(async () => screen.getByText("en").click());
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("ks_locale")).toBe("en");
    expect(screen.getByTestId("text").textContent).toBe("Save");

    await act(async () => screen.getByText("he").click());
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("he");
    expect(screen.getByTestId("text").textContent).toBe("שמירה");

    // Reload: boot.js picks up the stored choice.
    document.documentElement.removeAttribute("dir");
    runBoot();
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("he");
  });

  it("adopts the signed-in user's language and saves changes with PUT /api/me", async () => {
    const fetch = mockFetch({
      "PUT /api/me": (init) => ({ body: { user: { ...teacher, language: JSON.parse(String(init?.body)).language } } }),
    });
    render(
      <AuthProvider initialUser={{ ...teacher, language: "he" }}>
        <I18nProvider>
          <Probe />
        </I18nProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("he/rtl"));
    expect(document.documentElement.dir).toBe("rtl");

    await act(async () => screen.getByText("ar").click());
    expect(document.documentElement.lang).toBe("ar");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/me");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ language: "ar" });
    expect(screen.getByTestId("state").textContent).toBe("ar/rtl");
  });
});
