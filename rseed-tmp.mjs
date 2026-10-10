import fs from "fs"
import { neon } from "./node_modules/@neondatabase/serverless/index.mjs"
let url; for (const l of fs.readFileSync(`${process.env.HOME}/SAIL/.env.local`, "utf8").split("\n")) { const m = l.match(/^NEON_DATABASE_URL="?([^"]*)"?$/); if (m) url = m[1] }
const q = (t, p = []) => neon(url).query(t, p)
const ORG = "claude-raise-test", U = "2cf12194-c7dd-40c7-bd9f-dd0ce576ef8d", D = "claude-test.invalid"
const clean = async () => {
  await q("delete from action_proposals where org_id=$1", [ORG]); await q("delete from outreach_messages where crm_entry_id like 'raise-%'"); await q("delete from crm_entries where org_id=$1", [ORG])
  await q("delete from lp_match_sessions where fund_profile_id='00000000-0000-4000-8000-0000000000aa'"); await q("delete from fund_profiles where org_id=$1", [ORG]); await q("delete from memberships where org_id=$1", [ORG])
  await q("delete from audit_events where scope_key=$1", ["org:" + ORG]); await q("delete from organizations where id=$1", [ORG])
}
await clean()
if (process.argv[2] === "seed") {
  await q("insert into organizations (id, kind, name, owner_user_id, created_by) values ($1,'fund','Claude Raise Test (throwaway)',$2,$2)", [ORG, U])
  await q("insert into memberships (id, user_id, org_id, org_role, persona, can_send_outreach) values ($1,$2,$3,'workspace_owner','vc',true)", ["m-" + ORG, U, ORG])
  await q("insert into fund_profiles (id, user_id, org_id, is_active, fund_name, name, target_raise, sectors, geographic_focus) values ('00000000-0000-4000-8000-0000000000aa',$1,$2,true,'Claude Seed Fund','Claude Seed Fund',0,'[\"AI/ML\"]'::jsonb,'[\"Europe\"]'::jsonb)", [U, ORG])
  await q("insert into lp_match_sessions (fund_profile_id, total_firms_matched, total_contacts_matched, user_id) values ('00000000-0000-4000-8000-0000000000aa', 30, 60, $1)", [U])
  for (let i = 0; i < 12; i++) await q("insert into crm_entries (id, org_id, user_id, source, display_name, display_title, display_type, display_location, display_email, display_linkedin, display_score, why_match, stage) values ($1,$2,$3,'lp_matching',$4,'Investment Director',$5,'Zurich, Switzerland',$6,$7,$8,'backs emerging fund managers in European technology','queued')", [`raise-e${i}`, ORG, U, `Test LP ${i}`, i % 2 ? "Family Office" : "Institutional Investor", i < 6 ? `lp${i}@${D}` : null, `https://www.linkedin.com/in/claude-test-${i}`, 95 - i])
  await q("update platform_flags set enabled=true where key='outreach_sending_paused'")
  console.log("seeded; sending paused")
} else { await q("update platform_flags set enabled=false where key='outreach_sending_paused'"); console.log("cleaned; pause off") }
