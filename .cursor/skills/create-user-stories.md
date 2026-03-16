---
name: create-user-stories
description: Generate Jira-ready user stories with acceptance criteria from `.flow/features/<slug>/spec.md` and `tasks.md`. Outputs one markdown file per story in a Confluence-friendly table format. Use this skill after `create-feature` has produced a spec and task breakdown. Trigger whenever the user mentions "user stories", "Jira stories", "acceptance criteria", "story breakdown", or wants to convert a feature spec into ticketable work items.
disable-model-invocation: true
---

# Create User Stories

## Purpose

Convert feature planning docs (`spec.md` and `tasks.md`) into individual user story files, each with structured acceptance criteria in markdown table format ready to copy-paste into Confluence or Jira.

## Boundaries

- Story generation only — does not modify the source `spec.md` or `tasks.md`
- Never implement or propose implementation code
- If asked to implement: `Implementation is out of scope for this skill. Use run-task to implement.`
- Writable files limited to:
  - `.flow/features/<slug>/stories/US-NNN-<short-name>.md` (one per story)
  - `.flow/features/<slug>/stories/index.md` (story index / summary)

## Input

- Feature slug (to locate `.flow/features/<slug>/`)
- Reads `spec.md` for context: problem, outcomes, decisions, acceptance checks, key scenarios
- Reads `tasks.md` for task phases, verification checklists, and file references
- Use `AskQuestion` if the slug is ambiguous or if spec/tasks are missing

## Load Context

1. Read `.flow/features/<slug>/spec.md` — extract:
   - `## TL;DR` for the high-level problem/outcome/boundaries
   - `## Acceptance Checks` for measurable pass/fail criteria
   - `## Key Scenarios` for trigger/condition → expected outcome pairs
   - `## Durable Decisions` for constraints that shape stories
   - `## Must-Fail Gates` for stop/rollback conditions
   - `## Out of Scope` to know what NOT to write stories for
2. Read `.flow/features/<slug>/tasks.md` — extract:
   - Phase structure (N.M numbered tasks)
   - Verification checklists per phase
   - File references for each task
3. Read `.flow/memory/overview.md` (if present) for project-wide context
4. If equivalent stories already exist, warn user and ask whether to overwrite or append

## Story Derivation Rules

The goal is to produce stories that a developer can pick up and work on independently. Each story should be a thin vertical slice — not a horizontal layer.

### Mapping tasks to stories

- Each phase in `tasks.md` typically maps to 1–3 user stories
- Group tightly coupled tasks (e.g., a model + its migration + its API endpoint) into one story
- Split tasks that serve different user-facing outcomes into separate stories
- A task that is purely technical (e.g., "set up CI config") becomes a **technical story** with the persona "As a developer"
- Never create a story with zero acceptance criteria — if you can't define "done", the story is too vague

### Story sizing

- Each story should be completable in 1–3 days of work
- If a story feels larger, split it and note the dependency
- If a story feels trivially small (< 2 hours), consider merging with a related story

### Acceptance criteria derivation

- Pull directly from `## Acceptance Checks` in `spec.md` where they map to this story
- Pull from verification checklists in `tasks.md` for the relevant phase
- Pull from `## Key Scenarios` where the trigger/condition relates to this story
- Add edge cases and error paths that the spec implies but doesn't enumerate
- Each criterion must be independently testable — a QA engineer should be able to verify it without reading the spec

## Quiz Before Writing

Before generating story files, present the proposed story list to the user:

- Numbered list with story title + 1-line scope
- Suggested personas for each
- Ask: "Too many? Too few? Merge or split any stories?"
- Iterate until user approves the breakdown
- Skip quiz only if user explicitly says "just do it" or equivalent

## Create Artifacts

1. Create `.flow/features/<slug>/stories/` directory
2. For each story, write `US-NNN-<short-name>.md` using this template:

```markdown
# US-NNN: <Story Title>

## User Story

**As a** <persona>,
**I want** <capability/action>,
**So that** <business value/outcome>.

## Details

<2-4 sentences of context. Reference the relevant decisions from spec.md
that constrain this story. Mention which phase/tasks from tasks.md this
story covers.>

## Acceptance Criteria

| # | Criterion | Given | When | Then |
|---|-----------|-------|------|------|
| 1 | <short name> | <precondition> | <action> | <expected result> |
| 2 | <short name> | <precondition> | <action> | <expected result> |
| ... | | | | |

## Edge Cases & Error Handling

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | <error/edge scenario> | <what should happen> |
| ... | | |

## Dependencies

- **Blocked by:** <US-NNN or "none">
- **Blocks:** <US-NNN or "none">

## Technical Notes

<Brief implementation hints from tasks.md file references.
Keep it short — this is for developer context, not a design doc.>

## Story Points

**Estimate:** <S / M / L>
**Phase:** <phase number from tasks.md>

---
*Source: `.flow/features/<slug>/spec.md` · `.flow/features/<slug>/tasks.md`*
```

3. Write `stories/index.md` with:

```markdown
# User Stories: <Feature Title>

> Generated from `.flow/features/<slug>/spec.md` and `tasks.md`

## Summary

| Story | Title | Persona | Size | Phase | Status |
|-------|-------|---------|------|-------|--------|
| US-001 | <title> | <persona> | S/M/L | <phase> | Draft |
| US-002 | <title> | <persona> | S/M/L | <phase> | Draft |
| ... | | | | | |

## Dependency Graph

<List story dependencies in execution order.
Use plain text, e.g.: US-001 → US-002 → US-004, US-003 (independent)>

## Coverage Check

- **Spec acceptance checks covered:** <list which checks map to which stories>
- **Uncovered checks:** <any acceptance checks not yet captured — should be none>
- **Out of scope items confirmed excluded:** <list from spec's Out of Scope>
```

## Confluence Copy-Paste Guide

The markdown table format used in each story file is designed to paste cleanly into Confluence. When copying:

1. Open the story `.md` file
2. Select all content (Cmd+A / Ctrl+A)
3. Paste into Confluence editor — tables auto-convert to Confluence tables
4. The Given/When/Then columns in acceptance criteria map directly to Confluence's built-in table formatting
5. Headers (`#`, `##`) convert to Confluence heading styles

If pasting doesn't preserve tables, use Confluence's "Insert markup" (Ctrl+Shift+D) and paste the raw markdown.

## Output Format

```text
Created: `.flow/features/<slug>/stories/`
Stories generated:
- US-001-<name>.md
- US-002-<name>.md
- ...
Index: stories/index.md

Coverage: all acceptance checks mapped
Next: copy individual story files to Confluence/Jira
```

## Guardrails

- Every acceptance check from `spec.md` must appear in at least one story — verify this in `index.md`
- Stories must be vertically sliced — never "build all models first, then all APIs, then all UI"
- Each story must have at least 2 acceptance criteria in Given/When/Then format
- Never invent requirements not traceable to `spec.md` or `tasks.md`
- Keep story titles short (< 10 words) — they become Jira ticket titles
- Use consistent numbering: US-001, US-002, etc. (zero-padded to 3 digits)
- Personas must be real roles, not generic ("As a user" is OK only if the product has one user type)
- Edge cases section can say "none" but cannot be omitted
- Dependencies section must always be present — "none" is a valid value
- Do not embed code snippets in stories — file references belong in Technical Notes only
- Unresolved ambiguity → `AskQuestion`, never guess
