import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest"
const state = vi.hoisted(() => ({ sql: vi.fn(), send: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: state.sql }))
vi.mock("@/lib/email/resend", () => ({ isResendConfigured: () => true, sendEmail: state.send }))
import { changeWorkspaceTeam, getWorkspaceTeam, reviewInvitation, hashInvitation } from "@/lib/org/team"
let db: PGlite
const owner = { id: "owner", email: "owner@test.invalid", email_confirmed_at: "2026-01-01" }
const member = { id: "member", email: "member@test.invalid", email_confirmed_at: "2026-01-01" }
const migration = (name: string) => readFileSync(`scripts/migrations/${name}`, "utf8")
const revision = async () => Number((await db.query<{ team_revision: number }>("SELECT team_revision FROM organizations WHERE id='a'")).rows[0].team_revision)
const action = async (actor: typeof owner, input: Record<string,unknown>) => changeWorkspaceTeam(actor, "a", { revision: await revision(), ...input })
const invite = async (extra = {}) => action(owner, { action: "invite", email: member.email, role: "member", ...extra })
const token = (result: any) => new URL(result.invitationUrl).hash.slice(1)
beforeAll(async () => {
  db = new PGlite()
  const orgs = migration("2026-08-08-personas-owner.sql")
  await db.exec(orgs.slice(orgs.indexOf("CREATE TABLE IF NOT EXISTS organizations")))
  await db.exec(migration("2026-09-13-workspace-team-lifecycle.sql"))
  await db.exec(migration("2026-09-13-workspace-team-lifecycle.sql"))
  state.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q,s,i) => q+(i ? `$${i}` : "")+s,""), values)).rows)
},30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec("DELETE FROM workspace_access_events; DELETE FROM workspace_invitations; DELETE FROM workspace_ownership_transfers; DELETE FROM memberships; DELETE FROM organizations; INSERT INTO organizations(id,kind,name,owner_user_id) VALUES('a','company','Company A','owner'),('b','company','Company B','other'); INSERT INTO memberships(id,user_id,org_id,org_role,persona,can_send_outreach) VALUES('owner','owner','a','workspace_owner','founder',true),('other','other','b','workspace_owner','founder',true);")
  state.send.mockReset().mockResolvedValue({ resendId: "provider-receipt" })
})
it("stores only invitation hashes and requires the invited verified email", async () => {
  const link = await invite()
  const stored = (await db.query<{ token_hash: string }>("SELECT token_hash FROM workspace_invitations")).rows[0]
  expect(stored.token_hash).toBe(hashInvitation(token(link)))
  expect(stored.token_hash).not.toContain(token(link))
  await expect(reviewInvitation({ ...member, email_confirmed_at: undefined },token(link),true)).rejects.toMatchObject({ status: 403 })
  await expect(reviewInvitation({ ...member, email: "wrong@test.invalid" },token(link),true)).rejects.toMatchObject({ code: "42501" })
  expect(await reviewInvitation(member,token(link),true)).toEqual({ orgId: "a" })
  expect(await reviewInvitation(member,token(link),true)).toEqual({ orgId: "a" })
  expect((await db.query("SELECT * FROM memberships WHERE user_id='member'")).rows).toHaveLength(1)
})
it("revokes replaced and expired links, and does not revive removed membership", async () => {
  const old = await invite(), replacement = await invite()
  await expect(reviewInvitation(member,token(old),true)).rejects.toMatchObject({ code: "42501" })
  await reviewInvitation(member,token(replacement),true)
  await action(owner,{ action: "remove_member", userId: "member" })
  await expect(reviewInvitation(member,token(replacement),true)).rejects.toMatchObject({ code: "42501" })
  const expired = await invite()
  await db.exec("UPDATE workspace_invitations SET expires_at=now()-interval '1 hour' WHERE status='pending'")
  await expect(reviewInvitation(member,token(expired),true)).rejects.toMatchObject({ code: "42501" })
})
it("prevents members and admins escalating access or touching another workspace", async () => {
  await reviewInvitation(member,token(await invite()),true)
  await expect(action(member,{ action:"invite", email:"new@test.invalid", role:"viewer" })).rejects.toMatchObject({ code:"42501" })
  await action(owner,{ action:"change_role",userId:"member",role:"admin" })
  await expect(action(member,{ action:"invite",email:"new@test.invalid",role:"admin" })).rejects.toMatchObject({ code:"42501" })
  await expect(action(member,{ action:"change_role",userId:"owner",role:"viewer" })).rejects.toMatchObject({ code:"42501" })
  await expect(changeWorkspaceTeam(member,"b",{ action:"archive",revision:0 })).rejects.toMatchObject({ code:"42501" })
})
it("requires recipient acceptance and preserves an owner throughout a transfer", async () => {
  await reviewInvitation(member,token(await invite()),true)
  const transfer = await action(owner,{ action:"start_transfer",userId:"member" })
  expect((await getWorkspaceTeam(owner,"a")).workspace.owner_user_id).toBe("owner")
  await expect(action(owner,{ action:"leave" })).rejects.toMatchObject({ code:"42501" })
  await expect(action(owner,{ action:"accept_transfer",transferId:transfer.transferId })).rejects.toMatchObject({ code:"42501" })
  await action(member,{ action:"accept_transfer",transferId:transfer.transferId })
  const team = await getWorkspaceTeam(member,"a")
  expect(team.isOwner).toBe(true)
  expect(team.members.find(m => m.user_id === "owner").org_role).toBe("admin")
  expect(team.members.filter(m => m.org_role === "workspace_owner")).toHaveLength(1)
  await expect(action(owner,{ action:"archive" })).rejects.toMatchObject({ code:"42501" })
})
it("serializes competing role/transfer changes and rejects stale team revisions", async () => {
  await reviewInvitation(member,token(await invite()),true)
  const rev = await revision()
  const changes = await Promise.allSettled([
    changeWorkspaceTeam(owner,"a",{action:"start_transfer",userId:"member",revision:rev}),
    changeWorkspaceTeam(owner,"a",{action:"remove_member",userId:"member",revision:rev}),
  ])
  expect(changes.filter(r => r.status === "fulfilled")).toHaveLength(1)
  expect(changes.find(r => r.status === "rejected")).toMatchObject({ reason:{code:"40001"} })
})
it("archives without deleting data, blocks acceptance, and lets only the owner restore", async () => {
  const link = await invite()
  await action(owner,{action:"archive"})
  await expect(reviewInvitation(member,token(link),true)).rejects.toMatchObject({ code:"42501" })
  expect((await getWorkspaceTeam(owner,"a")).workspace.archived_at).toBeTruthy()
  await action(owner,{action:"restore"})
  expect((await getWorkspaceTeam(owner,"a")).workspace.archived_at).toBeNull()
  expect((await db.query("SELECT action FROM workspace_access_events ORDER BY id")).rows.map((r:any) => r.action)).toEqual(["invite","archive","restore"])
})
it("does not claim email delivery when the provider fails and retains a usable link", async () => {
  state.send.mockRejectedValue(Error("provider unavailable"))
  const result = await invite({delivery:"email"})
  expect(result.deliveryStatus).toBe("failed")
  expect(result.invitationUrl).toContain("/join-workspace#")
  expect((await db.query("SELECT delivery_status FROM workspace_invitations")).rows[0]).toEqual({delivery_status:"failed"})
})

it("lets the owner explicitly pause and restore their own sending without changing ownership",async()=>{
  await action(owner,{action:'set_sending',canSendOutreach:false})
  const paused=await getWorkspaceTeam(owner,'a')
  expect(paused.isOwner).toBe(true)
  expect(paused.members[0].can_send_outreach).toBe(false)
  await action(owner,{action:'set_sending',canSendOutreach:true})
  expect((await getWorkspaceTeam(owner,'a')).members[0].can_send_outreach).toBe(true)
  await reviewInvitation(member,token(await invite()),true)
  await expect(action(member,{action:'set_sending',canSendOutreach:true})).rejects.toMatchObject({code:'42501'})
})
