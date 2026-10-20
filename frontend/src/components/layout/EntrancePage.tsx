import markUrl from "@/assets/brand/sharnaqa-mark.webp";
import { LOCALE_NAMES } from "@/i18n/config";
import { BRANDS, type Brand } from "@/lib/brand";

/**
 * kids.kortexd.com: the chooser between the two entrances (lib/brand). It has no interface
 * language of its own, so each card speaks its entrance's language and names it in its own
 * script. Plain links: choosing loads the app under that entrance.
 */
export function EntrancePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-ground px-4 py-8" data-testid="entrance-page">
      <img src={markUrl} alt="" aria-hidden width={120} height={120} className="select-none" draggable={false} />
      <ul className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
        {[BRANDS.sharnaqa, BRANDS.nitzanim].map((b) => (
          <li key={b.key}>
            <EntranceCard brand={b} />
          </li>
        ))}
      </ul>
    </main>
  );
}

function EntranceCard({ brand }: { brand: Brand }) {
  const own = brand.locale;
  return (
    <a
      href={`${brand.base}/`}
      lang={own}
      dir={own === "en" ? "ltr" : "rtl"}
      className="ks-press flex min-h-32 flex-col items-center justify-center gap-1 rounded-xl border-[3px] border-ink bg-surface p-5 text-center shadow-lip-lg hover:bg-tray focus-visible:outline-offset-[3px] active:translate-y-1 active:shadow-none"
      data-testid={`entrance-${brand.key}`}
    >
      <span className="font-display text-display-lg font-semibold text-ink">{brand.names[own]}</span>
      <span className="text-sm text-ink-muted" dir="ltr">
        {brand.names.en}
      </span>
      <span className="mt-1 text-base font-medium text-brand">{LOCALE_NAMES[own]}</span>
    </a>
  );
}
