import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts (CSP font-src 'self'), wght axis only; each @font-face has a
// per-script unicode-range, so a locale downloads only the subsets it uses.
//   Fredoka: display face for Latin and Hebrew; Baloo Bhaijaan 2: display face for Arabic;
//   Rubik: body and every teacher control, all three scripts.
import "@fontsource-variable/fredoka";
import "@fontsource-variable/baloo-bhaijaan-2";
import "@fontsource-variable/rubik";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
