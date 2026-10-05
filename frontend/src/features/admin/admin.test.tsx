import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { User } from "@/auth/AuthProvider";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { routes } from "./routes";
import type { AdminUser, ClassRow, ParentLink } from "./types";

const me: User = { id: "u-admin", name: "Admin Person", email: "admin", role: "admin", language: "en" };

const users: AdminUser[] = [
  { id: "u-admin", name: "Admin Person", email: "admin", role: "admin", language: "en", is_active: true, last_login_at: null, created_at: null },
  { id: "u-t1", name: "Rana Haddad", email: "rana@example.org", role: "teacher", language: "ar", is_active: true, last_login_at: null, created_at: null },
  { id: "u-p1", name: "Dana Levi", email: "dana@example.org", role: "parent", language: "he", is_active: true, last_login_at: null, created_at: null },
  { id: "u-p2", name: "Omar Saleh", email: "omar", role: "parent", language: "ar", is_active: false, last_login_at: null, created_at: null },
];

const classes: ClassRow[] = [
  { id: "c1", name: "Butterflies", kindergarten: "Sunflower KG", teachers: [{ id: "u-t1", name: "Rana Haddad" }], child_count: 2 },
  { id: "c2", name: "Bees", kindergarten: "Olive KG", teachers: [], child_count: 0 },
];

const body = (init: RequestInit | undefined) => JSON.parse(String(init?.body ?? "null"));

/** The open dialog whose title is `title`. */
async function dialogTitled(title: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { name: title });
  return heading.closest("dialog") as HTMLElement;
}

describe("admin routes", () => {
  it("adds Users (80) and Classes (85) to the admin nav only", async () => {
    mockFetch({ "GET /api/users": { body: { users } } });
    renderApp({ routes, url: "/admin/users", user: me });
    await screen.findByText("Rana Haddad");
    expect(screen.getAllByRole("link", { name: /Classes/ }).length).toBeGreaterThan(0);
  });

  it("teachers cannot open the users page", async () => {
    mockFetch({});
    renderApp({ routes, url: "/admin/users", user: teacher });
    await waitFor(() => expect(screen.queryByText("Add user")).toBeNull());
  });
});

describe("UsersPage", () => {
  it("lists users, marks yourself and hides self-deactivation", async () => {
    mockFetch({ "GET /api/users": { body: { users } } });
    renderApp({ routes, url: "/admin/users", user: me });
    const self = await screen.findByTestId("user-row-admin");
    expect(within(self).getByText("You")).toBeTruthy();
    expect(within(self).queryByRole("button", { name: /Deactivate/ })).toBeNull();
    const omar = screen.getByTestId("user-row-omar");
    expect(within(omar).getByText("Inactive")).toBeTruthy();
    expect(within(omar).getByRole("button", { name: /Activate/ })).toBeTruthy();
  });

  it("filters by role tab and search", async () => {
    mockFetch({ "GET /api/users": { body: { users } } });
    renderApp({ routes, url: "/admin/users", user: me });
    await screen.findByText("Rana Haddad");
    fireEvent.click(screen.getByRole("tab", { name: /Parents/ }));
    expect(screen.queryByText("Rana Haddad")).toBeNull();
    expect(screen.getByText("Dana Levi")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search by name or email"), { target: { value: "omar" } });
    expect(screen.queryByText("Dana Levi")).toBeNull();
    expect(screen.getByText("Omar Saleh")).toBeTruthy();
  });

  it("creates a user with a lower-cased identifier and validates the password length", async () => {
    let created: unknown = null;
    const fetch = mockFetch({
      "GET /api/users": { body: { users } },
      "POST /api/users": (init) => {
        created = body(init);
        return { status: 201, body: { user: { ...users[1], id: "u-new", name: "New Teacher", email: "new@x.org" } } };
      },
    });
    renderApp({ routes, url: "/admin/users", user: me });
    await screen.findByText("Rana Haddad");
    fireEvent.click(screen.getAllByRole("button", { name: /Add user/ })[0]!);
    const dialog = await dialogTitled("New user");
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "New Teacher" } });
    fireEvent.change(within(dialog).getByLabelText(/Email or username/), { target: { value: " New@X.org " } });
    fireEvent.change(within(dialog).getByLabelText(/^Password/), { target: { value: "short" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await within(dialog).findByText("At least 10 characters.", { selector: "[role=alert]" })).toBeTruthy();
    expect(created).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Password/), { target: { value: "long-enough-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(created).toEqual({ name: "New Teacher", email: "new@x.org", role: "teacher", language: "en", password: "long-enough-1" }));
    await waitFor(() => expect(fetch.mock.calls.filter(([u]) => String(u).startsWith("/api/users")).length).toBeGreaterThanOrEqual(3));
  });

  it("shows a duplicate identifier inline", async () => {
    mockFetch({
      "GET /api/users": { body: { users } },
      "POST /api/users": { status: 409, body: { error: { code: "DUPLICATE", message: "dup" } } },
    });
    renderApp({ routes, url: "/admin/users", user: me });
    await screen.findByText("Rana Haddad");
    fireEvent.click(screen.getAllByRole("button", { name: /Add user/ })[0]!);
    const dialog = await dialogTitled("New user");
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "Rana" } });
    fireEvent.change(within(dialog).getByLabelText(/Email or username/), { target: { value: "rana@example.org" } });
    fireEvent.change(within(dialog).getByLabelText(/^Password/), { target: { value: "long-enough-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await within(dialog).findByText("Someone already uses this email or username.")).toBeTruthy();
  });

  it("deactivates after confirmation", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/users": { body: { users } },
      "PUT /api/users/u-t1": (init) => {
        sent = body(init);
        return { body: { user: { ...users[1], is_active: false } } };
      },
    });
    renderApp({ routes, url: "/admin/users", user: me });
    const row = await screen.findByTestId("user-row-rana@example.org");
    fireEvent.click(within(row).getByRole("button", { name: /Deactivate/ }));
    const dialog = await dialogTitled("Deactivate Rana Haddad?");
    expect(within(dialog).getByText("Deactivate Rana Haddad?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(sent).toEqual({ is_active: false }));
  });

  it("does not send a role when you edit yourself", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/users": { body: { users } },
      "PUT /api/users/u-admin": (init) => {
        sent = body(init);
        return { body: { user: users[0] } };
      },
    });
    renderApp({ routes, url: "/admin/users", user: me });
    const row = await screen.findByTestId("user-row-admin");
    fireEvent.click(within(row).getByRole("button", { name: /Edit/ }));
    const dialog = await dialogTitled("Edit user");
    expect((within(dialog).getByLabelText(/^Role/) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: "Boss" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toEqual({ name: "Boss", language: "en" }));
  });

  it("sets a new password", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/users": { body: { users } },
      "POST /api/users/u-t1/password": (init) => {
        sent = body(init);
        return { status: 204 };
      },
    });
    renderApp({ routes, url: "/admin/users", user: me });
    const row = await screen.findByTestId("user-row-rana@example.org");
    fireEvent.click(within(row).getByRole("button", { name: /Password/ }));
    const dialog = await dialogTitled("Set a new password");
    fireEvent.change(within(dialog).getByLabelText(/^New password/), { target: { value: "Fresh-pass-2026" } });
    fireEvent.change(within(dialog).getByLabelText(/^Repeat the new password/), { target: { value: "Fresh-pass-2026" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Set password" }));
    await waitFor(() => expect(sent).toEqual({ password: "Fresh-pass-2026" }));
  });

  it("works in Arabic (RTL)", async () => {
    mockFetch({ "GET /api/users": { body: { users } } });
    renderApp({ routes, url: "/admin/users", user: { ...me, language: "ar" }, locale: "ar" });
    expect(await screen.findByText("Rana Haddad")).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getAllByText("المستخدمون").length).toBeGreaterThan(0);
  });
});

describe("ClassesPage", () => {
  it("groups classes by kindergarten with teachers and counts", async () => {
    mockFetch({ "GET /api/classes": { body: { classes } } });
    renderApp({ routes, url: "/admin/classes", user: me });
    const card = await screen.findByTestId("class-Butterflies");
    expect(within(card).getByText("2 children")).toBeTruthy();
    expect(within(card).getByText("Rana Haddad")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Olive KG" })).toBeTruthy();
    expect(within(screen.getByTestId("class-Bees")).getByText("No teacher yet")).toBeTruthy();
  });

  it("assigns teachers", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/classes": { body: { classes } },
      "GET /api/users": { body: { users: [users[1], { ...users[1], id: "u-t2", name: "Maha Nasser", email: "maha" }] } },
      "PUT /api/classes/c2/teachers": (init) => {
        sent = body(init);
        return { body: { class: { ...classes[1], teachers: [{ id: "u-t2", name: "Maha Nasser" }] } } };
      },
    });
    renderApp({ routes, url: "/admin/classes", user: me });
    const card = await screen.findByTestId("class-Bees");
    fireEvent.click(within(card).getByRole("button", { name: /Choose teachers/ }));
    const dialog = await dialogTitled("Teachers of Bees");
    fireEvent.click(await within(dialog).findByLabelText(/Maha Nasser/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toEqual({ user_ids: ["u-t2"] }));
  });

  it("explains why a class with children can't be deleted", async () => {
    mockFetch({
      "GET /api/classes": { body: { classes } },
      "DELETE /api/classes/c1": { status: 409, body: { error: { code: "CONFLICT", message: "has children" } } },
    });
    renderApp({ routes, url: "/admin/classes", user: me });
    const card = await screen.findByTestId("class-Butterflies");
    fireEvent.click(within(card).getByRole("button", { name: /Delete/ }));
    const dialog = await dialogTitled("Delete Butterflies?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByText("This class still has children. Move them to another class first.")).toBeTruthy();
  });

  it("lists a class's children with a Parents link", async () => {
    mockFetch({
      "GET /api/classes": { body: { classes } },
      "GET /api/children": { body: { children: [{ id: "k1", name: "Adam", preferred_name: null, class_id: "c1" }] } },
    });
    renderApp({ routes, url: "/admin/classes", user: me });
    const card = await screen.findByTestId("class-Butterflies");
    fireEvent.click(within(card).getByRole("button", { name: /Children and their parents/ }));
    const link = await within(card).findByRole("link", { name: /Parents/ });
    expect(link.getAttribute("href")).toBe("/admin/children/k1/parents");
    expect(within(card).getByText("Adam")).toBeTruthy();
  });
});

describe("ChildParentsPage", () => {
  const linked: ParentLink[] = [{ id: "u-p1", name: "Dana Levi", email: "dana@example.org", is_active: true, relation: "mother", linked_at: null }];
  const options = { relations: [{ key: "mother", label: { en: "Mother", ar: "الأم", he: "אמא" } }, { key: "father", label: { en: "Father", ar: "الأب", he: "אבא" } }] };

  it("shows linked parents and links another active parent with a relation", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/children/k1": { body: { child: { id: "k1", name: "Adam" } } },
      "GET /api/children/k1/parents": { body: { parents: linked } },
      "GET /api/users": { body: { users: [...users, { ...users[2], id: "u-p3", name: "Sami Khoury", email: "sami" }] } },
      "POST /api/children/k1/parents": (init) => {
        sent = body(init);
        return { status: 201, body: { parent: { ...linked[0], id: "u-p3" } } };
      },
    });
    renderApp({ routes, url: "/admin/children/k1/parents", user: me, options });
    expect(await screen.findByText("Parents of Adam")).toBeTruthy();
    const row = await screen.findByTestId("linked-dana@example.org");
    expect(within(row).getByText("Mother")).toBeTruthy();
    const account = screen.getByLabelText("Parent account") as HTMLSelectElement;
    const values = [...account.options].map((o) => o.value);
    // Already linked (u-p1) and inactive (u-p2) parents are not offered; teachers never are.
    expect(values).toEqual(["", "u-p3"]);
    fireEvent.change(account, { target: { value: "u-p3" } });
    fireEvent.change(screen.getByLabelText("Relation"), { target: { value: "father" } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    await waitFor(() => expect(sent).toEqual({ user_id: "u-p3", relation: "father" }));
  });

  it("unlinks after confirmation", async () => {
    let deleted = false;
    mockFetch({
      "GET /api/children/k1": { status: 404, body: { error: { code: "NOT_FOUND", message: "nf" } } },
      "GET /api/children/k1/parents": { body: { parents: linked } },
      "GET /api/users": { body: { users } },
      "DELETE /api/children/k1/parents/u-p1": () => {
        deleted = true;
        return { status: 204 };
      },
    });
    renderApp({ routes, url: "/admin/children/k1/parents", user: me, options });
    const row = await screen.findByTestId("linked-dana@example.org");
    fireEvent.click(within(row).getByRole("button", { name: /Unlink/ }));
    const dialog = await dialogTitled("Unlink Dana Levi?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it("is RTL in Hebrew", async () => {
    mockFetch({
      "GET /api/children/k1": { body: { child: { id: "k1", name: "אדם" } } },
      "GET /api/children/k1/parents": { body: { parents: [] } },
      "GET /api/users": { body: { users } },
    });
    renderApp({ routes, url: "/admin/children/k1/parents", user: { ...me, language: "he" }, locale: "he", options });
    expect(await screen.findByText("ההורים של אדם")).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
  });
});
