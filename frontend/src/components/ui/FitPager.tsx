import { Children, isValidElement, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { useFitPages } from "@/lib/useFitPages";
import { cn } from "@/lib/utils";

/**
 * Shows its children (cards, list rows, grid tiles) in screen-sized pages so the page itself
 * never needs vertical scrolling, with a small pager (Back · page x of y · Next) when there
 * is more than one page. Every child stays mounted; children off the page are hidden.
 *
 *   <FitPager className="grid gap-3 md:grid-cols-2" label={t("…")}>{cards}</FitPager>
 *
 * ``className`` lays out the children (a list or a grid); ``reserve`` is the room kept below
 * (the pager itself and, on phones, the bottom bar).
 */
export function FitPager({
  children,
  className,
  label,
  reserve = 96,
  as: Tag = "div",
  testId,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  reserve?: number;
  as?: "div" | "ul" | "ol";
  testId?: string;
}) {
  const { t } = useI18n();
  const items = Children.toArray(children).filter(isValidElement);
  const fit = useFitPages(items.length, { reserve });
  const Item = Tag === "div" ? "div" : "li";
  return (
    <div ref={fit.containerRef}>
      <Tag className={className} data-testid={testId}>
        {items.map((child, i) => (
          <Item key={child.key ?? i} ref={fit.itemRef(i)} hidden={!fit.visible(i)} className="min-w-0">
            {child}
          </Item>
        ))}
      </Tag>
      {fit.pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3" aria-label={label ?? t("common.pages")} data-testid="fit-pager">
          <button
            type="button"
            onClick={fit.prev}
            disabled={!fit.hasPrev}
            aria-label={t("common.previousPage")}
            className={cn("inline-flex size-11 items-center justify-center rounded-md border-[1.5px] border-line-strong bg-surface text-ink hover:bg-tray disabled:opacity-40")}
          >
            <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
          <span className="tabular text-sm text-ink-muted" aria-live="polite">
            {t("common.pageOf", { current: fit.page + 1, total: fit.pages })}
          </span>
          <button
            type="button"
            onClick={fit.next}
            disabled={!fit.hasNext}
            aria-label={t("common.nextPage")}
            className="inline-flex size-11 items-center justify-center rounded-md border-[1.5px] border-line-strong bg-surface text-ink hover:bg-tray disabled:opacity-40"
          >
            <ChevronRight className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
