import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMINS_GROUP, REFUSALS } from "@/modules/permissions/rules";

const { db, session } = vi.hoisted(() => ({
  db: {
    groupMember: { findMany: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    accountLink: { deleteMany: vi.fn() },
    form: { count: vi.fn(), updateMany: vi.fn() },
    page: { count: vi.fn(), updateMany: vi.fn() },
    revision: { count: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  session: { username: "alice" as string | null },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/accounts/auth", () => ({
  auth: { api: { getSession: async () => session.username
    ? { user: { username: session.username } } : null } },
}));

const { removeMember } = await import("@/modules/permissions/group-actions");
const {
  setAccountDisabled, deleteAccount, deleteOwnAccount, ownDeletionImpact,
} = await import("./lifecycle");

type Membership = { groupSlug: string; username: string | null; memberGroupSlug: string | null };
let members: Membership[];
let disabled: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  session.username = "alice";
  disabled = new Set(["bob"]);
  members = ["alice", "bob"].map((username) => ({
    groupSlug: ADMINS_GROUP.slug, username, memberGroupSlug: null,
  }));
  db.groupMember.findMany.mockImplementation(async ({ where }: { where: {
    groupSlug?: string;
    username?: string | { not: null };
    memberGroupSlug?: { not: null };
    user?: { disabledAt: null };
  } }) => members.filter((member) =>
    (!where.groupSlug || member.groupSlug === where.groupSlug) &&
    (typeof where.username === "string" ? member.username === where.username : !where.username || member.username !== null) &&
    (!where.memberGroupSlug || member.memberGroupSlug !== null) &&
    (!where.user || member.username !== null && !disabled.has(member.username))
  ));
  db.groupMember.deleteMany.mockImplementation(async ({ where }: { where: {
    groupSlug: string; username?: string; memberGroupSlug?: string;
  } }) => {
    members = members.filter((member) => !(member.groupSlug === where.groupSlug &&
      (where.username ? member.username === where.username : member.memberGroupSlug === where.memberGroupSlug)));
    return { count: 1 };
  });
  db.user.findUnique.mockImplementation(async ({ where }: { where: { username: string } }) => ({
    id: where.username, email: `${where.username}@example.org`,
  }));
  db.user.update.mockImplementation(async ({ where, data }: {
    where: { username: string }; data: { disabledAt: Date | null };
  }) => {
    if (data.disabledAt) disabled.add(where.username);
    else disabled.delete(where.username);
  });
  db.user.delete.mockImplementation(async ({ where }: { where: { id: string } }) => {
    members = members.filter((member) => member.username !== where.id);
  });
  db.page.count.mockResolvedValue(0);
  db.form.count.mockResolvedValue(0);
  db.revision.count.mockResolvedValue(0);
  db.$queryRaw.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (run: (tx: unknown) => unknown) => run(db));
});

describe("keeping an administrator able to sign in", () => {
  it("refuses to remove the active administrator when the other is disabled", async () => {
    expect(await removeMember(ADMINS_GROUP.slug, { username: "alice" })).toEqual({
      error: REFUSALS.lastAdmin,
    });
    expect(members.map((member) => member.username)).toEqual(["alice", "bob"]);
  });

  it("allows removing the disabled administrator", async () => {
    expect(await removeMember(ADMINS_GROUP.slug, { username: "bob" })).toBeUndefined();
    expect(members.map((member) => member.username)).toEqual(["alice"]);
  });

  it("allows leaving when another active administrator remains", async () => {
    disabled.clear();
    expect(await removeMember(ADMINS_GROUP.slug, { username: "alice" })).toBeUndefined();
    expect(members.map((member) => member.username)).toEqual(["bob"]);
  });

  it("still allows an ordinary group to become empty", async () => {
    members.push({ groupSlug: "editors", username: "alice", memberGroupSlug: null });
    expect(await removeMember("editors", { username: "alice" })).toBeUndefined();
    expect(members.every((member) => member.groupSlug !== "editors")).toBe(true);
  });

  it("does not count a nested group as a remaining administrator", async () => {
    members.push({ groupSlug: ADMINS_GROUP.slug, username: null, memberGroupSlug: "editors" });
    expect(await removeMember(ADMINS_GROUP.slug, { username: "alice" })).toEqual({ error: REFUSALS.lastAdmin });
  });

  it("refuses self-erasure and its preview when the other administrator is disabled", async () => {
    expect((await ownDeletionImpact())?.refusal).toBe(REFUSALS.lastAdmin);
    expect(await deleteOwnAccount()).toBe(REFUSALS.lastAdmin);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("rechecks departure after a successful preview", async () => {
    disabled.clear();
    expect((await ownDeletionImpact())?.refusal).toBeNull();
    await setAccountDisabled("bob", true);
    expect(await deleteOwnAccount()).toBe(REFUSALS.lastAdmin);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it("allows self-erasure with another active administrator", async () => {
    disabled.clear();
    expect(await deleteOwnAccount()).toBeNull();
    expect(members.map((member) => member.username)).toEqual(["bob"]);
  });

  it("allows erasing a disabled administrator without blocking on their membership", async () => {
    expect(await deleteAccount("bob", "alice")).toBeNull();
    expect(members.map((member) => member.username)).toEqual(["alice"]);
    expect(db.page.updateMany).toHaveBeenCalledWith({ where: { ownerUsername: "bob" }, data: { ownerUsername: "alice" } });
    expect(db.form.updateMany).toHaveBeenCalledWith({ where: { ownerUsername: "bob" }, data: { ownerUsername: "alice" } });
  });

  it("refuses erasure before any ownership changes", async () => {
    expect(await deleteAccount("alice", "bob")).toBe(REFUSALS.lastAdmin);
    expect(db.page.updateMany).not.toHaveBeenCalled();
    expect(db.form.updateMany).not.toHaveBeenCalled();
    expect(db.accountLink.deleteMany).not.toHaveBeenCalled();
  });

  it("still refuses disabling oneself even when another administrator remains", async () => {
    disabled.clear();
    expect(await setAccountDisabled("alice", true)).toContain("propre compte");
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("disables another administrator and revokes their sessions", async () => {
    disabled.clear();
    expect(await setAccountDisabled("bob", true)).toBeNull();
    expect(disabled.has("bob")).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { username: "bob" },
      data: { disabledAt: expect.any(Date), sessions: { deleteMany: {} } },
    });
  });

  it("allows reactivation without treating it as a departure", async () => {
    expect(await setAccountDisabled("bob", false)).toBeNull();
    expect(disabled.has("bob")).toBe(false);
  });

  it("lets a non-administrator erase only their own account", async () => {
    session.username = "charlie";
    expect(await deleteOwnAccount()).toBeNull();
    await expect(deleteAccount("alice", null)).rejects.toThrow();
    await expect(removeMember(ADMINS_GROUP.slug, { username: "alice" })).rejects.toThrow();
    await expect(setAccountDisabled("alice", true)).rejects.toThrow();
  });
});
