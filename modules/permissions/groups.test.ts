import { describe, expect, it } from "vitest";
import {
  acceptsNestedGroups,
  effectiveGroups,
  groupDeletionImpact,
  groupDeletionRefusal,
  groupRenameRefusal,
  inheritedGroups,
  inheritedMembers,
  isProtectedGroup,
  memberRemovalRefusal,
  nestedGroupPaths,
  nestingCycle,
  nestingCycleMessage,
  stillMemberMessage,
} from "./groups";
import { ADMINS_GROUP } from "@/modules/permissions/rules";

// The nesting of the spec's own example (docs/permissions.md § Groupes):
// @Rédacteurs contains @Bureau, which contains @Trésorerie.
const REDACTEURS_NESTING = [
  { groupSlug: "redacteurs", memberGroupSlug: "bureau" },
  { groupSlug: "bureau", memberGroupSlug: "tresorerie" },
];

describe("effectiveGroups", () => {
  it("adds every group holding one of the person's own, at any depth", () => {
    expect(effectiveGroups(REDACTEURS_NESTING, ["tresorerie"])).toEqual([
      "bureau",
      "redacteurs",
      "tresorerie",
    ]);
  });

  it("leaves a person whose groups contain no other where they are", () => {
    expect(effectiveGroups(REDACTEURS_NESTING, ["redacteurs"])).toEqual([
      "redacteurs",
    ]);
  });

  it("gives a visitor no group at all", () => {
    expect(effectiveGroups(REDACTEURS_NESTING, [])).toEqual([]);
  });
});

describe("nestedGroupPaths", () => {
  it("names the way down to each group held, however deep", () => {
    expect(nestedGroupPaths(REDACTEURS_NESTING, "redacteurs")).toEqual(
      new Map([
        ["bureau", ["bureau"]],
        ["tresorerie", ["bureau", "tresorerie"]],
      ])
    );
  });

  it("holds nothing when the group holds no other group", () => {
    expect(nestedGroupPaths(REDACTEURS_NESTING, "tresorerie")).toEqual(
      new Map()
    );
  });

  it("keeps the shortest way when two lead to the same group", () => {
    const twoWays = [
      ...REDACTEURS_NESTING,
      { groupSlug: "redacteurs", memberGroupSlug: "tresorerie" },
    ];
    expect(nestedGroupPaths(twoWays, "redacteurs").get("tresorerie")).toEqual([
      "tresorerie",
    ]);
  });

  it("terminates on a cycle a broken database could hold", () => {
    const cycle = [
      ...REDACTEURS_NESTING,
      { groupSlug: "tresorerie", memberGroupSlug: "redacteurs" },
    ];
    expect([...nestedGroupPaths(cycle, "redacteurs").keys()]).toEqual([
      "bureau",
      "tresorerie",
    ]);
  });
});

// « Un cycle est refusé à l'enregistrement, en nommant le chemin fautif »
// (docs/permissions.md § Groupes) — the refusal has to be readable by the
// administrator who wrote the nesting, hence the way back, not a verdict.
describe("nestingCycle", () => {
  it("names the way back when the member already holds the group", () => {
    const nesting = [
      { groupSlug: "redacteurs", memberGroupSlug: "tresorerie" },
      { groupSlug: "tresorerie", memberGroupSlug: "bureau" },
    ];
    expect(
      nestingCycle(nesting, {
        groupSlug: "bureau",
        memberGroupSlug: "redacteurs",
      })
    ).toEqual(["redacteurs", "tresorerie", "bureau"]);
  });

  it("names the two ends when the member holds the group directly", () => {
    expect(
      nestingCycle(REDACTEURS_NESTING, {
        groupSlug: "bureau",
        memberGroupSlug: "redacteurs",
      })
    ).toEqual(["redacteurs", "bureau"]);
  });

  it("refuses a group put inside itself", () => {
    expect(
      nestingCycle([], { groupSlug: "bureau", memberGroupSlug: "bureau" })
    ).toEqual(["bureau"]);
  });

  it("lets a deeper nesting through when nothing comes back", () => {
    expect(
      nestingCycle(REDACTEURS_NESTING, {
        groupSlug: "tresorerie",
        memberGroupSlug: "amis",
      })
    ).toBeNull();
  });
});

describe("nestingCycleMessage", () => {
  it("names the guilty way, as the spec words it", () => {
    expect(nestingCycleMessage(["Rédacteurs", "Trésorerie", "Bureau"])).toBe(
      "@Rédacteurs contient déjà @Bureau, via @Trésorerie."
    );
  });

  it("drops the « via » when the two groups touch", () => {
    expect(nestingCycleMessage(["Rédacteurs", "Bureau"])).toBe(
      "@Rédacteurs contient déjà @Bureau."
    );
  });

  it("says the obvious about a group put inside itself", () => {
    expect(nestingCycleMessage(["Bureau"])).toBe(
      "@Bureau ne peut pas se contenir lui-même."
    );
  });
});

// @Admins is protected like a special page (docs/permissions.md § Groupes):
// never deletable, never renamable, never empty — and people only, so that
// the list of administrators reads at a glance.
describe("the protection of @Admins", () => {
  it("refuses a nested group, where any other group takes one", () => {
    expect(acceptsNestedGroups(ADMINS_GROUP.slug)).toBe(false);
    expect(acceptsNestedGroups("bureau")).toBe(true);
  });

  it("is neither renamable nor deletable, where any other group is", () => {
    expect(isProtectedGroup(ADMINS_GROUP.slug)).toBe(true);
    expect(isProtectedGroup("bureau")).toBe(false);
  });

  it("refuses to lose its last member, and says what it holds", () => {
    expect(
      memberRemovalRefusal({ groupSlug: ADMINS_GROUP.slug, memberCount: 1 })
    ).toBe("Ce wiki doit garder au moins un administrateur.");
  });

  it("lets an administrator go as soon as another remains", () => {
    expect(
      memberRemovalRefusal({ groupSlug: ADMINS_GROUP.slug, memberCount: 2 })
    ).toBeNull();
  });

  it("lets any other group empty out", () => {
    expect(memberRemovalRefusal({ groupSlug: "bureau", memberCount: 1 })).toBe(
      null
    );
  });
});

// « La retirer avertit qu'elle reste membre par imbrication » — removing the
// chip did what it said, and the toast keeps the screen honest about the
// person still being there.
describe("stillMemberMessage", () => {
  it("names the way the person keeps in by", () => {
    expect(stillMemberMessage("Marie Durand", ["Bureau", "Trésorerie"])).toBe(
      "Marie Durand reste membre via @Bureau › @Trésorerie."
    );
  });
});

// The group editor keeps what can be changed apart from what can only be
// observed (docs/permissions.md § Les écrans): direct members are chips with
// a ×, inherited ones are read-only lines carrying the way in.
describe("inheritedMembers", () => {
  const memberships = [
    { groupSlug: "tresorerie", username: "marie-durand" },
    { groupSlug: "bureau", username: "sophie-vidal" },
    { groupSlug: "redacteurs", username: "paul-riva" },
  ];

  it("gathers the people held below, with the way each comes in by", () => {
    expect(
      inheritedMembers(REDACTEURS_NESTING, memberships, "redacteurs")
    ).toEqual([
      { username: "marie-durand", path: ["bureau", "tresorerie"] },
      { username: "sophie-vidal", path: ["bureau"] },
    ]);
  });

  it("leaves out a direct member, who shows up once as a chip", () => {
    const alsoDirect = [
      ...memberships,
      { groupSlug: "redacteurs", username: "marie-durand" },
    ];
    expect(
      inheritedMembers(REDACTEURS_NESTING, alsoDirect, "redacteurs").map(
        (member) => member.username
      )
    ).toEqual(["sophie-vidal"]);
  });

  it("shows the shortest way in when several lead to the same person", () => {
    const twoWays = [
      ...REDACTEURS_NESTING,
      { groupSlug: "redacteurs", memberGroupSlug: "tresorerie" },
    ];
    expect(
      inheritedMembers(twoWays, memberships, "redacteurs").find(
        (member) => member.username === "marie-durand"
      )
    ).toEqual({ username: "marie-durand", path: ["tresorerie"] });
  });
});

// The other way round, on a user's line: « c'est souvent là qu'on cherche
// pourquoi quelqu'un a accès ».
describe("inheritedGroups", () => {
  it("names each group joined by nesting, and the way up to it", () => {
    expect(inheritedGroups(REDACTEURS_NESTING, ["tresorerie"])).toEqual([
      { slug: "bureau", path: ["tresorerie"] },
      { slug: "redacteurs", path: ["bureau", "tresorerie"] },
    ]);
  });

  it("leaves out a group the person was added to directly", () => {
    expect(
      inheritedGroups(REDACTEURS_NESTING, ["tresorerie", "bureau"])
    ).toEqual([{ slug: "redacteurs", path: ["bureau"] }]);
  });
});

// Refusing a action on the protected group names it: « ce groupe » leaves
// the reader to work out which one, on a screen that shows several.
describe("the permissions @Admins refuses", () => {
  it("names the group it will not let be renamed", () => {
    expect(groupRenameRefusal(ADMINS_GROUP.slug)).toBe(
      "Le groupe @Admins ne peut pas être renommé."
    );
  });

  it("names the group it will not let be deleted", () => {
    expect(groupDeletionRefusal(ADMINS_GROUP.slug)).toBe(
      "Le groupe @Admins ne peut pas être supprimé."
    );
  });

  it("refuses neither action on any other group", () => {
    expect(groupRenameRefusal("bureau")).toBeNull();
    expect(groupDeletionRefusal("bureau")).toBeNull();
  });
});

describe("groupDeletionImpact", () => {
  it("says how many pages carry a right naming the group", () => {
    expect(groupDeletionImpact("Bureau", 23)).toBe(
      "@Bureau apparaît dans les droits de 23 pages. Le supprimer retirera ces droits."
    );
  });

  it("agrees in the singular", () => {
    expect(groupDeletionImpact("Bureau", 1)).toContain("de 1 page.");
  });

  it("says nothing when the deletion takes no right with it", () => {
    expect(groupDeletionImpact("Bureau", 0)).toBeNull();
  });
});
