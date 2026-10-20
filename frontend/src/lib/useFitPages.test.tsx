import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFitPages } from "./useFitPages";

/** Lays every block out 100px tall, one under the other from the top of the window. */
function layOut() {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const i = Number(this.dataset.i ?? 0);
    return { top: i * 100, bottom: i * 100 + 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: i * 100, toJSON: () => ({}) } as DOMRect;
  });
}

function List({ count }: { count: number }) {
  const fit = useFitPages(count, { reserve: 96 });
  return (
    <div ref={fit.containerRef}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-i={i} ref={fit.itemRef(i)} hidden={!fit.visible(i)}>
          block {i}
        </div>
      ))}
      <p data-testid="pages">{fit.pages}</p>
    </div>
  );
}

beforeEach(() => {
  layOut();
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("innerWidth", 1280);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useFitPages", () => {
  it("keeps a list that fits on one page", () => {
    render(<List count={6} />);
    expect(screen.getByTestId("pages").textContent).toBe("1");
  });

  it("does not open a second page for a list that only just overflows", () => {
    // 704px of room (800 - 96); 8 blocks end at 800px, within one row of slack.
    render(<List count={8} />);
    expect(screen.getByTestId("pages").textContent).toBe("1");
    expect(screen.getByText("block 7")).toBeTruthy();
  });

  it("splits a long list into screen-sized pages", () => {
    render(<List count={12} />);
    expect(screen.getByTestId("pages").textContent).toBe("2");
    // The first page holds the 7 blocks that end within 704px.
    expect(screen.getByText("block 6").hidden).toBe(false);
    expect(screen.getByText("block 7").hidden).toBe(true);
  });
});
