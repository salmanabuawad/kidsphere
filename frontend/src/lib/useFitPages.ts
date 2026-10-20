import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Splits a long list of blocks (questions) into pages that fit the screen, so a form never
 * needs vertical scrolling: every block stays mounted (answers and focus are kept), blocks
 * off the current page are hidden.
 *
 *   const fit = useFitPages(items.length, { reserve: 120 });
 *   <div ref={fit.containerRef}>{items.map((it, i) => <div key={…} ref={fit.itemRef(i)} hidden={!fit.visible(i)}>…)}</div>
 *   next: fit.hasNext ? fit.next() : goToNextStep()
 *
 * The first render shows everything once to measure it (and again after the window is
 * resized or the number of blocks changes); then each page holds as many blocks as fit
 * between the container's top and the window's bottom minus ``reserve`` (the sticky action
 * bar). A block taller than the space gets a page of its own.
 */
/** How far past the screen a list may run before it is split into pages (about one row of cards). */
const SLACK = 160;

export function useFitPages(count: number, { reserve = 120 }: { reserve?: number } = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const [measuring, setMeasuring] = useState(true);
  // Every request to measure bumps the round, so a request that lands in the same render as the end
  // of a measurement (both batched, measuring stays true) still runs the measurement again.
  const [round, setRound] = useState(0);
  const remeasure = useCallback(() => {
    setMeasuring(true);
    setRound((r) => r + 1);
  }, []);
  const [pages, setPages] = useState<number[][]>([]);
  // The split belongs to the list it was measured on: until a list of a new length is measured,
  // everything shows (never a stale split that hides the new rows).
  const [measuredCount, setMeasuredCount] = useState(-1);
  const [page, setPage] = useState(0);

  // Re-measure when the blocks change, the window is resized, the web fonts arrive, or the content
  // above the list moves (a header that loads its data late): a split measured too early is wrong.
  const measuredTop = useRef<number | null>(null);
  useEffect(() => remeasure(), [count, remeasure]);
  useEffect(() => {
    let alive = true;
    if (document.fonts && document.fonts.status !== "loaded") void document.fonts.ready.then(() => alive && remeasure());
    if (typeof ResizeObserver === "undefined") return () => void (alive = false);
    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el || measuredTop.current === null) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (Math.abs(top - measuredTop.current) > 4) remeasure();
    });
    ro.observe(document.body);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [remeasure]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(remeasure, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [remeasure]);

  useLayoutEffect(() => {
    if (!measuring) return;
    const top = containerRef.current ? containerRef.current.getBoundingClientRect().top + window.scrollY : 0;
    measuredTop.current = top;
    // Below lg the page keeps 128px under it for the bottom bar (and its raised Observe block).
    const bottomBar = window.innerWidth < 1024 ? 136 : 0;
    const available = Math.max(200, window.innerHeight - top - reserve - bottomBar);
    // Positions, not just heights, so grids (cards side by side) page by rows.
    const out: number[][] = [];
    let current: number[] = [];
    let pageTop: number | null = null;
    for (let i = 0; i < count; i++) {
      const el = items.current[i];
      const rect = el && el.offsetHeight > 0 ? el.getBoundingClientRect() : null;
      if (!rect) {
        current.push(i); // a hidden (not shown) block takes no room
        continue;
      }
      if (pageTop === null) pageTop = rect.top;
      if (rect.bottom - pageTop > available && current.some((j) => (items.current[j]?.offsetHeight ?? 0) > 0)) {
        out.push(current);
        current = [i];
        pageTop = rect.top;
      } else {
        current.push(i);
      }
    }
    if (current.length || out.length === 0) out.push(current);
    // A list that only just overflows stays on one page (the page scrolls a little): a second
    // page holding a card or two reads as a mistake.
    const shown = items.current.slice(0, count).filter((el): el is HTMLElement => !!el && el.offsetHeight > 0);
    if (out.length > 1 && shown.length) {
      const first = shown[0]!.getBoundingClientRect().top;
      const last = Math.max(...shown.map((el) => el.getBoundingClientRect().bottom));
      if (last - first <= available + SLACK) out.splice(0, out.length, Array.from({ length: count }, (_, i) => i));
    }
    setPages(out);
    setMeasuredCount(count);
    setPage((p) => Math.min(p, out.length - 1));
    setMeasuring(false);
  }, [measuring, round, count, reserve]);

  const itemRef = useCallback((i: number) => (el: HTMLElement | null) => {
    items.current[i] = el;
  }, []);

  const reset = useCallback(() => setPage(0), []);
  const total = measuredCount === count ? Math.max(pages.length, 1) : 1;
  const stale = measuring || measuredCount !== count;
  const visible = (i: number) => stale || (pages[page] ?? []).includes(i);
  const go = (p: number) => {
    setPage(Math.max(0, Math.min(total - 1, p)));
    window.scrollTo({ top: 0 });
  };

  return {
    containerRef,
    itemRef,
    visible,
    page,
    pages: total,
    hasNext: page < total - 1,
    hasPrev: page > 0,
    next: () => go(page + 1),
    prev: () => go(page - 1),
    reset,
    toLast: () => setPage(total - 1),
  };
}
