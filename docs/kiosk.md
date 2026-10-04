# Child device / kiosk configuration

Kidsphere's child mode is an **application-level** lock: while a child session is active the browser can only reach `/play`, adult APIs are refused, and exiting needs the adult PIN. A web app cannot stop a child from leaving the browser, so pair it with OS-level lockdown on shared devices:

| Platform   | Recommended setup                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPad       | Settings → Accessibility → **Guided Access** (triple-click to start, passcode to end). Open Kidsphere in Safari, launch child mode, start Guided Access. For fleets use an MDM "Single App Mode" profile. |
| Android    | Settings → Security → **App pinning** (screen pinning) with "Ask for PIN before unpinning". For fleets use Android Enterprise dedicated-device (COSU) mode with Chrome locked to the Kidsphere URL.       |
| Chromebook | Kiosk app / managed guest session with URL allow-list (`https://<your-domain>/*`).                                                                                                                        |
| Windows    | Assigned Access (single-app kiosk) with Microsoft Edge kiosk mode pointing at the Kidsphere URL.                                                                                                          |

Also recommended: disable browser extensions, set the Kidsphere origin as the only allowed site, turn off in-app purchases and notifications.
