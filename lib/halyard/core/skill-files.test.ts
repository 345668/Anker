// @ts-nocheck
// Ported from the Halyard desktop test/skill-files.test.js (docs/architecture/62 H1): same fixtures, same assertions, run with vitest.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSkillMarkdown, validateSkill, loadSkillFiles } from './skill-files';
import { splitActionSections, bodyFor, SECTION_ACTIONS } from './skill-files';

function tempRoot(skills) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'halyard-skills-'));
  for (const [dir, files] of Object.entries(skills)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, dir, name), text);
  }
  return root;
}

const GOOD = `---
name: pitch-practice
description: Coaches a founder through an investor pitch. Use when the call is a fundraising pitch.
halyard:
  base: call
  modes: [say, followup]
  context: []
  maxTokens: { say: 500 }
---

# Pitch practice

Speak as the founder.`;

test('the shipped interview skill parses and validates', () => {
  const text = fs.readFileSync(path.join(process.cwd(), 'skills', 'halyard', 'interview-coaching', 'SKILL.md'), 'utf8');
  const { meta, body, errors } = parseSkillMarkdown(text);
  assert.deepEqual(errors, []);
  assert.deepEqual(validateSkill(meta, body), []);
  assert.equal(meta.name, 'interview-coaching');
  assert.equal(meta.halyard.replaces, 'interview');
  assert.deepEqual(meta.halyard.modes, ['assist', 'say', 'followup', 'recap', 'ask', 'answerThis']);
  assert.deepEqual(meta.halyard.maxTokens, { say: 700, answerThis: 700, assist: 700, recap: 700 });
});

test('frontmatter: scalars, lists, inline maps and nested blocks', () => {
  const { meta, body } = parseSkillMarkdown(GOOD);
  assert.equal(meta.halyard.base, 'call');
  assert.deepEqual(meta.halyard.modes, ['say', 'followup']);
  assert.deepEqual(meta.halyard.context, []);
  assert.deepEqual(meta.halyard.maxTokens, { say: 500 });
  assert.match(body, /^# Pitch practice/);
});

test('validation follows the Agent Skills rules and rejects unknown Halyard fields', () => {
  const bad = (meta, body = 'x') => validateSkill(meta, body).join(' | ');
  assert.match(bad({ name: 'Bad Name', description: 'd' }), /lowercase/);
  assert.match(bad({ name: 'my-claude-skill', description: 'd' }), /must not contain/);
  assert.match(bad({ name: 'a'.repeat(65), description: 'd' }), /64/);
  assert.match(bad({ name: 'ok', description: '' }), /description is required/);
  assert.match(bad({ name: 'ok', description: 'x'.repeat(1025) }), /1024/);
  assert.match(bad({ name: 'ok', description: 'uses <b>tags</b>' }), /XML/);
  assert.match(bad({ name: 'ok', description: 'd' }, ''), /body is empty/);
  assert.match(bad({ name: 'ok', description: 'd', halyard: { modes: ['sing'] } }), /unknown action "sing"/);
  assert.match(bad({ name: 'ok', description: 'd', halyard: { base: 'podcast' } }), /base/);
  assert.equal(bad({ name: 'ok', description: 'd' }), '');
});

test('a missing frontmatter block is reported, not guessed', () => {
  const { meta, errors } = parseSkillMarkdown('# Just a heading\n\nNo frontmatter.');
  assert.equal(meta, null);
  assert.match(errors.join(), /missing --- frontmatter/);
});

test('loading: user folder overrides the app by id; invalid skills are reported, stories load with the skill', () => {
  const app = tempRoot({
    'pitch-practice': { 'SKILL.md': GOOD },
    broken: { 'SKILL.md': '---\nname: Broken\n---\n' },
    'not-a-skill': { 'README.md': 'ignored' },
  });
  const user = tempRoot({
    mine: { 'SKILL.md': GOOD.replace('Speak as the founder.', 'Speak as ME.'), 'stories.md': '## Story one\nIt went well.' },
  });
  const { skills, errors } = loadSkillFiles([{ dir: app, source: 'app' }, { dir: user, source: 'user' }, { dir: '/nonexistent', source: 'user' }]);
  assert.equal(skills.length, 1, 'same name → one skill');
  assert.equal(skills[0].source, 'user');
  assert.match(skills[0].body, /Speak as ME/);
  assert.match(skills[0].stories, /Story one/);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /broken[\\/]SKILL\.md: .*lowercase/);
});

test('halyard.notesFocus is read as one line of text and validated', () => {
  const withFocus = GOOD.replace('  base: call\n', '  base: call\n  notesFocus: "Objections, pricing, next steps"\n');
  const root = tempRoot({ pitch: { 'SKILL.md': withFocus } });
  const { skills, errors } = loadSkillFiles([{ dir: root, source: 'user' }]);
  assert.deepEqual(errors, []);
  assert.equal(skills[0].notesFocus, 'Objections, pricing, next steps');
  const { meta, body } = parseSkillMarkdown(GOOD.replace('  base: call\n', '  base: call\n  notesFocus: 42\n'));
  assert.match(validateSkill(meta, body).join(), /notesFocus/);
  const plain = loadSkillFiles([{ dir: tempRoot({ pitch: { 'SKILL.md': GOOD } }), source: 'user' }]);
  assert.equal(plain.skills[0].notesFocus, null);
});

// ── action sections (docs/skills-playbooks-and-notes-2026-09-25.md) ──────────

test('action sections: shared body goes everywhere, a section only to its actions', () => {
  const body = '# T\n\nShared rule.\n\n## Action: say, answerThis\nSAY_ONLY\n\n## Principles\nMore shared.\n\n## Action: recap\nRECAP_ONLY';
  const { shared, sections, errors } = splitActionSections(body);
  assert.deepEqual(errors, []);
  assert.match(shared, /Shared rule[\s\S]*More shared/, 'a plain ## heading ends an action section');
  assert.doesNotMatch(shared, /SAY_ONLY|RECAP_ONLY/);
  const skill = { body, shared, sections };
  assert.match(bodyFor(skill, 'say'), /SAY_ONLY/);
  assert.match(bodyFor(skill, 'answerThis'), /SAY_ONLY/);
  assert.doesNotMatch(bodyFor(skill, 'say'), /RECAP_ONLY/);
  assert.match(bodyFor(skill, 'recap'), /RECAP_ONLY/);
  assert.doesNotMatch(bodyFor(skill, 'followup'), /SAY_ONLY|RECAP_ONLY/);
  assert.match(bodyFor(skill, 'followup'), /Shared rule/);
});

test('an unknown action section is a validation error', () => {
  const { meta, body } = parseSkillMarkdown(GOOD + '\n\n## Action: dance\nNo.');
  assert.match(validateSkill(meta, body).join(), /unknown action section "dance"/);
});

test('every shipped skill is a full playbook: a section for each action, a Prep hint, a notes focus', () => {
  const { skills, errors } = loadSkillFiles([{ dir: path.join(process.cwd(), 'skills', 'halyard'), source: 'app' }]);
  assert.deepEqual(errors, []);
  assert.equal(skills.length, 4);
  for (const skill of skills) {
    const covered = new Set(skill.sections.flatMap((s) => s.actions));
    for (const action of ['say', 'answerThis', 'assist', 'followup', 'recap', 'prep', 'notes', 'email']) {
      assert.ok(covered.has(action), `${skill.name} has no "## Action: ${action}" section`);
    }
    assert.ok(skill.prepHint && skill.prepHint.length > 40, `${skill.name} has no prepHint`);
    assert.ok(skill.notesFocus, `${skill.name} has no notesFocus`);
    assert.match(bodyFor(skill, 'email'), /Subject:/, `${skill.name} email section asks for a subject line`);
  }
  assert.ok(SECTION_ACTIONS.includes('email'));
});
