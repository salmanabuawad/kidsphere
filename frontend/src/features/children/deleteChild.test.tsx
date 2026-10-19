import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/auth/AuthProvider";
import { paths } from "@/lib/paths";
import type { AppRoute } from "@/lib/routing";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { EditBasicsDialog } from "./EditBasicsDialog";
import type { ChildBasics } from "./types";

const admin: User = { id: "u-admin", name: "Admin", email: "admin", role: "admin", language: "en" };

const child: ChildBasics = {
  id: "c1",
  name: "Adam Haddad",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  gender: null,
  class: { id: "k1", name: "Butterflies", kindergarten: "Olive KG" },
  main_language: "ar",
  additional_languages: [],
  parent_name: null,
  parent_contact: null,
  has_photo: false,
  archived: true,
  updated_at: null,
  strengths: [],
  interests: [],
};

function routes(c: ChildBasics): AppRoute[] {
  return [
    { path: "/edit", element: <EditBasicsDialog child={c} open onClose={() => {}} onSaved={() => {}} />, layout: "bare" },
    { path: paths.children(), element: <p>children list</p>, layout: "bare" },
  ];
}

afterEach(() => vi.unstubAllGlobals());

describe("Delete permanently (edit dialog)", () => {
  it("an admin deletes an archived child only after typing the full name", async () => {
    const fetch = mockFetch({
      "GET /api/children": { body: { children: [], classes: [] } },
      "DELETE /api/children/c1": { status: 204 },
    });
    const { router } = renderApp({ routes: routes(child), url: "/edit", user: admin });
    fireEvent.click(await screen.findByRole("button", { name: "Delete permanently" }));
    expect(screen.getByText(/It cannot be undone/)).toBeTruthy();

    const confirm = () => screen.getAllByRole("button", { name: "Delete permanently" }).at(-1)!;
    const input = screen.getByLabelText(/To confirm, type the full name: Adam Haddad/);
    fireEvent.change(input, { target: { value: "Adam" } });
    expect(confirm().hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: " Adam Haddad " } });
    expect(confirm().hasAttribute("disabled")).toBe(false);

    fireEvent.click(confirm());
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.children()));
    expect(fetch.mock.calls.some(([url, init]) => String(url) === "/api/children/c1" && init?.method === "DELETE")).toBe(true);
  });

  it("is not offered to teachers, nor for a child that is not archived", async () => {
    mockFetch({ "GET /api/children": { body: { children: [], classes: [] } } });
    const { unmount } = renderApp({ routes: routes(child), url: "/edit", user: teacher });
    await screen.findByRole("button", { name: "Save" });
    expect(screen.queryByRole("button", { name: "Delete permanently" })).toBeNull();
    unmount();

    renderApp({ routes: routes({ ...child, archived: false }), url: "/edit", user: admin });
    await screen.findByRole("button", { name: "Archive child" });
    expect(screen.queryByRole("button", { name: "Delete permanently" })).toBeNull();
  });
});
