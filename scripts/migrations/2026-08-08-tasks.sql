-- Task / stage-pipeline engine (Carta "My To-Dos" + stage board).
-- Additive & idempotent. A task moves across stages; stage='done' = completed.
CREATE TABLE IF NOT EXISTS tasks (
  id           text PRIMARY KEY,
  org_id       text,                                   -- workspace scope (nullable for now)
  assignee_id  text NOT NULL,                          -- users.id
  title        text NOT NULL,
  entity_label text,                                   -- e.g. fund / company name
  stage        text NOT NULL DEFAULT 'to_do'
                 CHECK (stage IN ('to_do','in_progress','review','done')),
  priority     text CHECK (priority IN ('low','normal','high')),
  due_date     date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks(assignee_id, stage);
CREATE INDEX IF NOT EXISTS tasks_org_idx ON tasks(org_id);
