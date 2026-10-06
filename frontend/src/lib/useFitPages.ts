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
export function useFitPages(count: number, { reserve = 120 }: { reserve?: number } = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const [measuring, setMeasuring] = useState(true);
  const [pages, setPages] = useState<number[][]>([]);
  const [page, setPage] = useState(0);

  // Re-measure when the blocks change or the window is resized.
  useEffect(() => setMeasuring(true), [count]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setMeasuring(true), 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useLayoutEffect(() => {
    if (!measuring) return;
    const top = containerRef.current ? containerRef.current.getBoundingClientRect().top + window.scrollY : 0;
    const available = Math.max(200, window.innerHeight - top - reserve);
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
    setPages(out);
    setPage((p) => Math.min(p, out.length - 1));
    setMeasuring(false);
  }, [measuring, count, reserve]);

  const itemRef = useCallback((i: number) => (el: HTMLElement | null) => {
    items.current[i] = el;
  }, []);

  const reset = useCallback(() => setPage(0), []);
  const total = Math.max(pages.length, 1);
  const visible = (i: number) => measuring || (pages[page] ?? []).includes(i);
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
