# 08 — Audit logging: implementation architecture

**Date:** 2026-09-21 · **Status:** design, then build · **Implements:**
[05](05-founder-persona-audit.md) S1/S2/S8, [06](06-vc-persona-audit.md) V1,
[07](07-lp-persona-audit.md) L2

The three persona audits converged on one finding: *the platform records what
things are and almost never what they were.* This is the design for fixing it,
written before the code as the standing rule requires.

---

## 1. What exists

`lib/audit/audit-log.ts` — `logAudit()` inserts into `audit_events`, never
throws, and is called from **six** places. The table:

```
audit_events(id, actor_id, actor_email, action, target_type, target_id,
             target_label, metadata jsonb, ip, user_agent, created_at)
indexes: created_at DESC · (actor_email, created_at) · (target_type, target_id)
```

Two gaps in it, independent of how few callers it has:

1. **No tenant scope.** There is no `org_id`, no fund, no company. The only
   reader, `listAuditEvents()`, is the platform-owner feed at
   `/dashboard/admin/audit`, and it is global. A founder therefore cannot see
   the history of their own cap table — the trail would exist only for the
   platform operator.
2. **No change shape.** `metadata` is ad hoc per caller. The one equity caller
   (`app/api/share-plans/[id]`) records `{ status: "granted" }` — the new value,
   not the old one. A trail that records only new values cannot answer "what
   was it before".

## 2. Scope: every write to 13 tables

Mapped by searching every `INSERT INTO` / `UPDATE` / `DELETE FROM`:

| Persona | Table | Written in |
| --- | --- | --- |
| founder | `option_grants` | `carta-modules.ts`, `share-plans.ts` |
| founder | `valuations_409a` | `carta-modules.ts`, `valuation-409a.ts` |
| founder | `equity_filings` | `carta-modules.ts` |
| founder | `comp_bands` | `carta-modules.ts` |
| founder | `contracts` | `carta-modules.ts` |
| both | `spvs` | `carta-modules.ts`, `spv-economics.ts`, `spv-lifecycle.ts` |
| both | `loans` | `carta-modules.ts`, `loan-servicing.ts` |
| vc | `kyc_cases`, `kyc_screening_hits`, `kyc_documents` | `kyc.ts` |
| vc | `capital_calls` | `capital-calls.ts`, `app/api/portfolio/calls` |
| vc | `distributions` | `distributions.ts`, `app/api/portfolio/distributions` |
| vc | `lp_information_sharing` | `information-sharing.ts` |
| lp | capital-call / distribution acknowledgement | `app/api/lp/acknowledge` |

---

## 3. Design

### 3.1 One function, called at every write

```ts
await recordChange({
  actor:  { userId, email },                     // who
  scope:  { type: "company", id: companyId },    // whose data
  action: "option_grant.updated",                // what kind of change
  target: { type: "option_grant", id, label },   // which record
  before: rowBefore ?? null,                     // null on create
  after:  rowAfter  ?? null,                     // null on delete
})
```

It computes the field-level diff, redacts anything secret, and writes one
`audit_events` row. Like `logAudit`, it **never throws**: an audit write that
breaks a capital call is worse than a missing audit row. Unlike `logAudit`, a
failed write is logged loudly, because a silently missing record in a table
that exists to be complete is the failure this work is fixing.

**Amended after the first live verification (2026-09-22).** One run of a
six-event grant lifecycle recorded five. Eleven targeted re-runs could not
reproduce it, so the cause is unconfirmed — but the most plausible explanation
is a transient write error, swallowed exactly as designed. "Never throws" is
right; "never throws and gives up after one attempt" is not good enough for an
audit trail. The insert is now retried up to three times with a short backoff
(120 ms, 400 ms), logging a warning when a retry succeeds and an error only when
all three fail. Six further full runs, zero losses.

The same run exposed a second, confirmed fault: timestamps read back at
whole-second resolution, so events in the same second appeared identical and
ordering between them was arbitrary. `created_at` is now read as epoch
milliseconds computed in SQL, and every history query breaks ties on `id`.

### 3.2 Snapshots in the event, not N history tables

Doc 05 proposed `option_grants_history` and `valuations_409a_history`. This
design **supersedes that** with one mechanism: every event carries the full
`before` and `after` row.

| | History tables | Snapshots in `audit_events` |
| --- | --- | --- |
| Tables to create | one per entity (13) | zero |
| Recover a deleted row | yes | yes — `before` of the delete |
| "What did it look like on date X" | yes | yes — last event before X |
| Who changed it | needs a join to the audit log | same row |
| Cost of adding the next entity | a migration and a trigger | one call |

The existing `(target_type, target_id)` index already serves "history of this
record". The trade is that a snapshot per change is larger than a diff alone —
acceptable for financial records that change a handful of times a year, and the
reason high-frequency tables (outreach, AI calls) are deliberately **not** on
this list.

This also resolves doc 05 S2 for recoverability: a hard-deleted grant is
recoverable from the `before` of its delete event. Soft delete is still worth
doing for referential integrity, and is out of scope here.

### 3.3 Scope, without guessing a mapping

`companyId` in the founder modules comes from `resolveFounderCompanyId()`; the
VC modules key on `fund_id`. Neither is the org id, and mapping them onto one
now would be a guess.

So the event records **the boundary the module already uses**:

```sql
scope_key = 'company:<companyId>' | 'fund:<fundId>' | 'org:<orgId>'
```

Same convention as the scope key in [doc 00](00-persona-isolation.md). When that
lands, `company:` and `fund:` keys map onto it; until then, a tenant reader
filters on exactly the key its own module wrote.

### 3.4 The change shape

```jsonc
"changes": {
  "before": { ...full row... } | null,
  "after":  { ...full row... } | null,
  "diff":   { "status": ["draft", "granted"], "options": [10000, 12000] }
}
```

`diff` omits bookkeeping fields (`updated_at`, `created_at`) so that a save which
changes nothing produces an empty diff — and is **not recorded**. An audit trail
full of no-op saves hides the real changes in it.

Redaction strips known-secret fields (`*_token`, `*_secret`, `password*`,
`*api_key*`) before anything is stored.

### 3.5 Reading

```ts
listEntityHistory(scopeKey, targetType, targetId)   // one record's life
listScopeActivity(scopeKey, { limit, before })      // a tenant's own trail
```

Both require the caller's scope key, so a founder reading their cap-table
history can only ever read their own company's events. The owner feed at
`/dashboard/admin/audit` stays global and unchanged.

### 3.6 Snapshots without dynamic SQL

Capturing `before` means reading the row before the write. Table names cannot
be parameters, and the helper must not interpolate one — so `snapshotRow()`
switches over a **fixed allowlist** with a literal query per table. A table not
on the list returns `null`; it cannot be coerced into querying something else.

---

## 4. Migration

```sql
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS scope_key text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS changes   jsonb;
CREATE INDEX IF NOT EXISTS audit_events_scope_idx
  ON audit_events (scope_key, created_at DESC) WHERE scope_key IS NOT NULL;
```

Additive, nullable, non-breaking. The six existing callers keep working
unchanged; their rows simply have no scope.

## 5. Build order

1. Migration + `lib/audit/record-change.ts` + tests.
2. **Founder equity** — `option_grants`, `valuations_409a`, `equity_filings`,
   `comp_bands`, `contracts`, `spvs`, `loans`.
3. **VC fund operations** — `kyc_*`, `capital_calls`, `distributions`,
   `lp_information_sharing`.
4. **LP acknowledgement** — including `undo`, so a withdrawn acknowledgement is
   a recorded event rather than a flag reverting.
5. Delete the stale comment in `app/lp/page.tsx`.

Each step verified against the real database, not mocks.

## 6. Out of scope

- A tenant-facing history **UI**. The readers land here; the panel is a
  follow-up.
- Retention. `audit_events` has none; for records like these the right answer
  may be "never delete", which is a legal call rather than an engineering one.
- Soft delete on the equity tables.
- Tamper-evidence (hash-chaining events). Worth considering for KYC; a separate
  design.
- `logDocumentView()` (doc 06 V2). A one-line fix, but access logging rather
  than change logging, and it needs the viewer's identity worked out per path.
