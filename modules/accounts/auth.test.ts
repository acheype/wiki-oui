import { beforeEach, describe, expect, it, vi } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    accountLink: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: vi.fn(() => "database-adapter"),
}));
vi.mock("better-auth/next-js", () => ({ nextCookies: vi.fn(() => "cookies") }));
vi.mock("better-auth/plugins", () => ({ username: vi.fn(() => "username") }));
vi.mock("better-auth", () => ({ betterAuth: vi.fn((options) => ({ options })) }));

const { auth } = await import("./auth");

type CreatedUser = { email: string };
type UserCreated = (user: CreatedUser) => Promise<void>;

function userCreated(): UserCreated {
  const configured = auth as unknown as {
    options: {
      databaseHooks: { user: { create: { after: UserCreated } } };
    };
  };
  return configured.options.databaseHooks.user.create.after;
}

describe("account creation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("spends any link that predates the new account", async () => {
    await userCreated()({ email: "Marie@Example.test" });

    expect(db.accountLink.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { email: "marie@example.test" },
    });
  });
});
