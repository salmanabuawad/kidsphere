import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom does not implement scrolling (used by react-router's ScrollRestoration).
window.scrollTo = (() => undefined) as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
});
