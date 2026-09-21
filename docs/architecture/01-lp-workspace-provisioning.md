# 01 — LP workspace provisioning

**Date:** 2026-09-21 · **Status:** design · **Depends on:** nothing ·
**Spine:** [00-persona-isolation.md](00-persona-isolation.md)

An LP cannot create a workspace. Not "the flow is awkward" — the API refuses.

---

## 1. Where it stops, exactly

```ts
// app/api/onboarding/route.ts:12
account_type: z.enum(["founder", "vc"])

// app/api/onboarding/route.ts:46
if (persona !== "founder" && persona !== "vc")
  return NextResponse.json({ error: "Invalid path" }, { status: 400 })

// lib/org/provision.ts:5
export type Persona = "founder" | "vc"
```

And on disk: `app/onboarding/` contains `founder/` and `vc/`. There is no
`lp/`.

So an LP who signs up reaches an onboarding route that returns **400 "Invalid
path"**, with no indication that their persona is the reason.

### How LPs exist at all today

Through invitation, not creation. `lp_memberships` and the data-room flow give
an LP access to a *fund's* workspace, and `AiPrincipal` carries
`lpMemberships: LpMembership[]` alongside the ordinary `membership`. That path
works and is not being changed.

The gap is an LP who is not yet anyone's LP — a family office evaluating funds,
an institution running its own diligence — who has nothing to sign in to.

---

## 2. What an LP workspace is

The existing two answer a question each: a founder's workspace is a **company**
(`kind: "company"`), a VC's is a **fund** (`kind: "fund"`). An LP's is neither:
an LP allocates *into* funds and holds a portfolio of commitments.

```ts
kind: "allocator"
```

A third `organizations.kind`. Not "fund" — a fund raises, an allocator
deploys, and the fund-operations surfaces (capital calls, LP reporting,
fund tax) would be wrong for it. Reusing `fund` to avoid a migration would
make every `kind = 'fund'` query silently ambiguous.

### Profile shape

Mirroring `onboardingWorkspaceInput()` in `lib/org/provision.ts:23`, which
branches founder/VC on name, kind and profile:

```ts
persona === "lp" ? {
  name: data.institution,
  kind: "allocator",
  profile: {
    institutionType: data.institutionType,   // family office | endowment | fund-of-funds | pension | sovereign | corporate | individual
    aum: data.aum,
    ticketMin: data.ticketMin,
    ticketMax: data.ticketMax,
    stageFocus: data.stageFocus,             // pre-seed … growth
    sectorFocus: data.sectorFocus,
    geographyFocus: data.geographyFocus,
    vintageAppetite: data.vintageAppetite,   // which fund vintages they are looking at
    reUpPolicy: data.reUpPolicy,
  },
}
```

These fields are not invented for the form. They are the LP side of the
matching engine that already exists: `fundDraftSchema` in
`lib/matching/profile-readiness.ts` has `targetLpTypes`, `minimumCommitment`,
`averageTicket`, `geographicFocus` and `sectors` — the fund's view of the LP it
wants. This is the same shape from the other side, which means an LP workspace
becomes matchable against funds on day one rather than being a profile page.

---

## 3. Changes, by file

| File | Change |
| --- | --- |
| `lib/org/provision.ts:5` | `Persona = "founder" \| "vc" \| "lp"` — or better, import the one in `lib/org/active.ts` and delete this duplicate |
| `lib/org/provision.ts:23` | `onboardingWorkspaceInput` gains the `lp` branch above |
| `lib/org/provision.ts:66` | `FROM claimed WHERE ${persona === "vc"}` seeds a fund row for VCs; LPs seed no fund |
| `app/api/onboarding/route.ts:12` | enum gains `"lp"` |
| `app/api/onboarding/route.ts:46` | persona guard gains `"lp"` |
| `app/onboarding/lp/` | new — the step UI |
| `lib/nav/work-areas.ts` | LP gains the areas its workspace makes possible (doc 02) |
| migration | `organizations.kind` check constraint, if one exists, gains `allocator` |

**Delete the duplicate type rather than widening it.** Two `Persona` types with
the same name disagreeing by one member is what caused this gap, and widening
the narrow one leaves the trap in place for the next persona.

### The onboarding steps

Four, matching the existing shape (`step: z.number().int().min(0).max(3)`):

0. **Institution** — name, type, jurisdiction
1. **Mandate** — AUM, ticket range, stage and sector focus
2. **Geography and vintage** — where they allocate, which vintages are open
3. **Review** — confirm, create workspace

The draft mechanics need no change: `onboarding_drafts` is keyed
`(user_id, persona)` and already stores an arbitrary `data` JSON blob with a
`revision` for optimistic concurrency.

---

## 4. What the LP workspace unlocks

Provisioning is only worth doing if there is something to provision *into*.
With a workspace and a mandate profile, an LP gets:

- **Fund discovery** — the matching engine already runs LP ↔ fund in the other
  direction (`lib/matching/lp-matchmaking.ts` matches a fund to LPs). An LP
  workspace makes the reverse query answerable with data already present.
- **Commitments and capital activity** — `/lp/distributions` exists; today it
  reads from the fund side of an `lp_membership`. With a workspace, an LP can
  hold commitments across several funds in one place.
- **Their own CRM, outreach, LinkedIn and assistant** — doc 03. An LP talking
  to GPs is doing outreach, and currently has no surface for it.
- **Documents** — `/lp/documents` and `/lp/calls` already exist.

---

## 5. Risks

- **`kind: "allocator"` touches every query that assumes two kinds.** Before
  writing the migration, grep `kind = 'fund'` and `kind === "fund"` and decide
  each: does it mean "a fund" or "not a company"? The second reading is now
  wrong.
- **An LP with both a workspace and `lp_memberships`** — a family office that
  runs its own workspace *and* is an LP in someone's fund. Both must work at
  once. The scope key handles it (`org:<their own>` vs the fund's scope), but
  the workspace switcher must show both and label them distinguishably.
- **Matching quality.** An LP workspace that can query funds will be judged on
  the results. The fund-side profile data must be good enough for the reverse
  direction to be worth exposing; that is a data question, not a code one, and
  should be checked before the discovery surface ships.

## 6. Out of scope

- Migrating existing `lp_memberships` into workspaces. Invited LPs stay as they
  are; this adds a path, it does not replace one.
- Fund-operations surfaces for allocators (capital-call *receipt*, K-1 intake).
  Real LP needs, and each its own piece of work.
