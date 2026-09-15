-- Requires organization/membership foundations. No existing role is changed.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS team_revision integer NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS contact_email text;
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text NOT NULL REFERENCES organizations(id),
  email text NOT NULL, role text NOT NULL CHECK(role IN ('admin','member','viewer')),
  can_send_outreach boolean NOT NULL DEFAULT false, token_hash text NOT NULL UNIQUE,
  invited_by text NOT NULL, accepted_by text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz, delivery_status text NOT NULL DEFAULT 'link' CHECK(delivery_status IN ('link','pending','sent','failed')),
  provider_id text, delivery_error text
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitation_pending_idx ON workspace_invitations(org_id,lower(email)) WHERE status='pending';
CREATE TABLE IF NOT EXISTS workspace_ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text NOT NULL REFERENCES organizations(id),
  from_user_id text NOT NULL, to_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled')),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '48 hours', created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_transfer_pending_idx ON workspace_ownership_transfers(org_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS workspace_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(id),
  actor_user_id text NOT NULL, action text NOT NULL, target_user_id text,
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_access_events_org_idx ON workspace_access_events(org_id,id DESC);
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_ownership_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_access_events ENABLE ROW LEVEL SECURITY;

-- All team mutations lock the organization, then re-read permissions. This
-- serializes removal, acceptance and transfer even across separate API workers.
CREATE OR REPLACE FUNCTION workspace_team_action(p_actor text,p_org text,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o organizations%ROWTYPE; a memberships%ROWTYPE; t memberships%ROWTYPE;
  inv workspace_invitations%ROWTYPE; tr workspace_ownership_transfers%ROWTYPE;
  is_owner boolean; new_role text; target text; event_details jsonb := '{}'; result jsonb := '{}';
BEGIN
  SELECT * INTO o FROM organizations WHERE id=p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM memberships WHERE org_id=p_org AND user_id=p_actor;
  IF NOT FOUND OR a.persona IS DISTINCT FROM (CASE WHEN o.kind='company' THEN 'founder' ELSE 'vc' END) THEN
    RAISE EXCEPTION 'Workspace team access denied' USING ERRCODE='42501'; END IF;
  is_owner := coalesce(o.owner_user_id=p_actor AND a.org_role='workspace_owner',false);
  IF o.archived_at IS NOT NULL AND p_action<>'restore' THEN RAISE EXCEPTION 'Restore this workspace before changing its team' USING ERRCODE='42501'; END IF;
  IF (p_data->>'revision')::integer IS DISTINCT FROM o.team_revision THEN RAISE EXCEPTION 'The team changed. Reload before continuing.' USING ERRCODE='40001'; END IF;

  IF p_action='invite' THEN
    IF NOT is_owner AND a.org_role<>'admin' THEN RAISE EXCEPTION 'Only owners and admins can invite teammates' USING ERRCODE='42501'; END IF;
    new_role := p_data->>'role';
    IF new_role NOT IN ('admin','member','viewer') OR new_role IS NULL OR (new_role='admin' AND NOT is_owner) THEN
      RAISE EXCEPTION 'You cannot grant this role' USING ERRCODE='42501'; END IF;
    IF coalesce((p_data->>'canSendOutreach')::boolean,false) AND (NOT is_owner OR new_role='viewer') THEN
      RAISE EXCEPTION 'Only the owner can grant sending permission to editors' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM memberships WHERE org_id=p_org AND lower(contact_email)=lower(p_data->>'email')) THEN
      RAISE EXCEPTION 'This email already belongs to a teammate' USING ERRCODE='23505'; END IF;
    UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND lower(email)=lower(p_data->>'email') AND status='pending';
    INSERT INTO workspace_invitations(org_id,email,role,can_send_outreach,token_hash,invited_by,delivery_status)
    VALUES(p_org,lower(p_data->>'email'),new_role,coalesce((p_data->>'canSendOutreach')::boolean,false),p_data->>'tokenHash',p_actor,coalesce(p_data->>'delivery','link')) RETURNING * INTO inv;
    result := jsonb_build_object('invitationId',inv.id,'expiresAt',inv.expires_at);
    event_details := jsonb_build_object('invitationId',inv.id,'email',inv.email,'role',new_role);
  ELSIF p_action='revoke_invitation' THEN
    SELECT * INTO inv FROM workspace_invitations WHERE id=(p_data->>'invitationId')::uuid AND org_id=p_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE='P0002'; END IF;
    IF NOT is_owner AND (a.org_role<>'admin' OR inv.role='admin') THEN RAISE EXCEPTION 'You cannot revoke this invitation' USING ERRCODE='42501'; END IF;
    UPDATE workspace_invitations SET status='revoked' WHERE id=inv.id AND status='pending';
    event_details := jsonb_build_object('invitationId',inv.id);
  ELSIF p_action='set_sending' THEN
    IF NOT is_owner THEN RAISE EXCEPTION 'Only the owner can change their sending permission' USING ERRCODE='42501'; END IF;
    UPDATE memberships SET can_send_outreach=(p_data->>'canSendOutreach')::boolean WHERE id=a.id;
    target := p_actor;
    event_details := jsonb_build_object('canSendOutreach',(p_data->>'canSendOutreach')::boolean);
  ELSIF p_action IN ('change_role','remove_member','leave') THEN
    target := CASE WHEN p_action='leave' THEN p_actor ELSE p_data->>'userId' END;
    SELECT * INTO t FROM memberships WHERE org_id=p_org AND user_id=target;
    IF NOT FOUND THEN RAISE EXCEPTION 'Teammate not found' USING ERRCODE='P0002'; END IF;
    IF t.persona IS DISTINCT FROM a.persona THEN RAISE EXCEPTION 'Manage this membership through its persona-specific access workflow' USING ERRCODE='42501'; END IF;
    IF target=o.owner_user_id OR t.org_role='workspace_owner' THEN RAISE EXCEPTION 'Transfer ownership before removing or demoting an owner' USING ERRCODE='42501'; END IF;
    IF p_action<>'leave' AND NOT is_owner AND (a.org_role<>'admin' OR t.org_role NOT IN ('member','viewer')) THEN
      RAISE EXCEPTION 'You cannot manage this teammate' USING ERRCODE='42501'; END IF;
    IF p_action='change_role' THEN
      new_role := p_data->>'role';
      IF new_role NOT IN ('admin','member','viewer') OR new_role IS NULL OR (new_role='admin' AND NOT is_owner) THEN RAISE EXCEPTION 'You cannot grant this role' USING ERRCODE='42501'; END IF;
      IF p_data ? 'canSendOutreach' AND NOT is_owner THEN RAISE EXCEPTION 'Only the owner can change sending permission' USING ERRCODE='42501'; END IF;
      UPDATE memberships SET org_role=new_role, can_send_outreach=CASE WHEN new_role='viewer' THEN false ELSE coalesce((p_data->>'canSendOutreach')::boolean,can_send_outreach) END WHERE id=t.id;
      IF new_role IN ('member','viewer') THEN UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND invited_by=target AND status='pending'; END IF;
      event_details := jsonb_build_object('fromRole',t.org_role,'toRole',new_role,'canSendOutreach',CASE WHEN new_role='viewer' THEN false ELSE coalesce((p_data->>'canSendOutreach')::boolean,t.can_send_outreach) END);
    ELSE
      DELETE FROM memberships WHERE id=t.id;
      UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND invited_by=target AND status='pending';
      event_details := jsonb_build_object('formerRole',t.org_role);
    END IF;
    UPDATE workspace_ownership_transfers SET status='cancelled',resolved_at=now() WHERE org_id=p_org AND to_user_id=target AND status='pending';
  ELSIF p_action='start_transfer' THEN
    IF NOT is_owner THEN RAISE EXCEPTION 'Only the current owner can transfer ownership' USING ERRCODE='42501'; END IF;
    target := p_data->>'userId';
    SELECT * INTO t FROM memberships WHERE org_id=p_org AND user_id=target;
    IF NOT FOUND OR target=p_actor OR t.org_role NOT IN ('admin','member') OR t.persona IS DISTINCT FROM a.persona THEN
      RAISE EXCEPTION 'Choose an existing admin or member in this workspace' USING ERRCODE='42501'; END IF;
    UPDATE workspace_ownership_transfers SET status='cancelled',resolved_at=now() WHERE org_id=p_org AND status='pending';
    INSERT INTO workspace_ownership_transfers(org_id,from_user_id,to_user_id) VALUES(p_org,p_actor,target) RETURNING * INTO tr;
    result := jsonb_build_object('transferId',tr.id,'expiresAt',tr.expires_at);
  ELSIF p_action IN ('accept_transfer','cancel_transfer') THEN
    SELECT * INTO tr FROM workspace_ownership_transfers WHERE org_id=p_org AND id=(p_data->>'transferId')::uuid;
    IF NOT FOUND OR tr.status<>'pending' THEN RAISE EXCEPTION 'Transfer is no longer pending' USING ERRCODE='40001'; END IF;
    target := tr.to_user_id;
    IF p_action='cancel_transfer' THEN
      IF NOT is_owner AND p_actor<>target THEN RAISE EXCEPTION 'You cannot cancel this transfer' USING ERRCODE='42501'; END IF;
      UPDATE workspace_ownership_transfers SET status='cancelled',resolved_at=now() WHERE id=tr.id;
    ELSE
      IF p_actor<>target OR tr.expires_at<=now() OR o.owner_user_id<>tr.from_user_id OR a.org_role NOT IN ('admin','member') THEN
        RAISE EXCEPTION 'This transfer cannot be accepted. Ask the current owner to start again.' USING ERRCODE='42501'; END IF;
      UPDATE memberships SET org_role=CASE WHEN user_id=p_actor THEN 'workspace_owner' ELSE 'admin' END,
        can_send_outreach=CASE WHEN user_id=p_actor THEN true ELSE can_send_outreach END
        WHERE org_id=p_org AND user_id IN (p_actor,tr.from_user_id);
      UPDATE organizations SET owner_user_id=p_actor WHERE id=p_org;
      UPDATE workspace_ownership_transfers SET status='accepted',resolved_at=now() WHERE id=tr.id;
      UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND status='pending';
      event_details := jsonb_build_object('previousOwner',tr.from_user_id,'newOwner',target,'previousOwnerRole','admin');
    END IF;
  ELSIF p_action IN ('archive','restore') THEN
    IF NOT is_owner THEN RAISE EXCEPTION 'Only the owner can archive or restore a workspace' USING ERRCODE='42501'; END IF;
    UPDATE organizations SET archived_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END WHERE id=p_org;
    IF p_action='archive' THEN
      UPDATE workspace_invitations SET status='revoked' WHERE org_id=p_org AND status='pending';
      UPDATE workspace_ownership_transfers SET status='cancelled',resolved_at=now() WHERE org_id=p_org AND status='pending';
    END IF;
  ELSE RAISE EXCEPTION 'Unknown team action' USING ERRCODE='22023';
  END IF;
  UPDATE organizations SET team_revision=team_revision+1 WHERE id=p_org;
  INSERT INTO workspace_access_events(org_id,actor_user_id,action,target_user_id,details) VALUES(p_org,p_actor,p_action,target,event_details);
  RETURN result || jsonb_build_object('ok',true,'revision',o.team_revision+1);
END $$;

CREATE OR REPLACE FUNCTION workspace_accept_invitation(p_actor text,p_verified_email text,p_hash text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE inv workspace_invitations%ROWTYPE; o organizations%ROWTYPE; inviter memberships%ROWTYPE; member memberships%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM workspace_invitations WHERE token_hash=p_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation is invalid or unavailable' USING ERRCODE='P0002'; END IF;
  SELECT * INTO o FROM organizations WHERE id=inv.org_id FOR UPDATE;
  SELECT * INTO inv FROM workspace_invitations WHERE token_hash=p_hash;
  IF lower(p_verified_email) IS DISTINCT FROM lower(inv.email) OR p_verified_email IS NULL THEN RAISE EXCEPTION 'Sign in with the verified email this invitation was sent to' USING ERRCODE='42501'; END IF;
  IF o.archived_at IS NOT NULL THEN RAISE EXCEPTION 'This workspace is archived' USING ERRCODE='42501'; END IF;
  IF inv.status='accepted' AND inv.accepted_by=p_actor THEN
    IF EXISTS(SELECT 1 FROM memberships WHERE org_id=o.id AND user_id=p_actor) THEN RETURN o.id; END IF;
    RAISE EXCEPTION 'Your membership was removed. Request a new invitation.' USING ERRCODE='42501';
  END IF;
  IF inv.status<>'pending' OR inv.expires_at<=now() THEN RAISE EXCEPTION 'Invitation expired or was revoked. Request a new link.' USING ERRCODE='42501'; END IF;
  SELECT * INTO inviter FROM memberships WHERE org_id=o.id AND user_id=inv.invited_by;
  IF NOT FOUND OR inviter.org_role NOT IN ('workspace_owner','admin') OR
    (inv.role='admin' AND (inviter.org_role<>'workspace_owner' OR inv.invited_by<>o.owner_user_id)) THEN
    RAISE EXCEPTION 'The inviter no longer has permission. Request a new invitation.' USING ERRCODE='42501'; END IF;
  SELECT * INTO member FROM memberships WHERE org_id=o.id AND user_id=p_actor;
  IF FOUND THEN RAISE EXCEPTION 'You already belong to this workspace. Ask the owner to change your existing role.' USING ERRCODE='23505'; END IF;
  INSERT INTO memberships(id,user_id,org_id,org_role,persona,can_send_outreach,contact_email)
  VALUES(gen_random_uuid()::text,p_actor,o.id,inv.role,CASE WHEN o.kind='company' THEN 'founder' ELSE 'vc' END,inv.can_send_outreach,p_verified_email);
  UPDATE workspace_invitations SET status='accepted',accepted_by=p_actor,accepted_at=now() WHERE id=inv.id;
  UPDATE organizations SET team_revision=team_revision+1 WHERE id=o.id;
  INSERT INTO workspace_access_events(org_id,actor_user_id,action,target_user_id,details)
  VALUES(o.id,p_actor,'accept_invitation',p_actor,jsonb_build_object('invitationId',inv.id,'role',inv.role));
  RETURN o.id;
END $$;
-- Functions run with the calling database role, never SECURITY DEFINER.
REVOKE ALL ON FUNCTION workspace_team_action(text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION workspace_accept_invitation(text,text,text) FROM PUBLIC;
