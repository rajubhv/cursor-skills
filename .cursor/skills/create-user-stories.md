---
name: create-user-stories
description: Generate Jira-ready user stories with acceptance criteria from `.flow/features/<slug>/spec.md` and `tasks.md`. Writes from an experienced product owner's perspective — business-focused, outcome-driven, free of technical jargon. Outputs one markdown file per story in a Confluence-friendly table format. Use this skill after `create-feature` has produced a spec and task breakdown. Trigger whenever the user mentions "user stories", "Jira stories", "acceptance criteria", "story breakdown", or wants to convert a feature spec into ticketable work items.
disable-model-invocation: true
---

# Create User Stories

## Purpose

Convert feature planning docs (`spec.md` and `tasks.md`) into individual user story files written from the perspective of an experienced product owner. Stories focus on **what the user needs and why** — never on how the system implements it. Each story includes structured acceptance criteria in markdown table format ready to copy-paste into Confluence or Jira.

## Voice & Tone

Write every story as a seasoned product owner would — someone who deeply understands the user's world and speaks their language. This means:

- **Lead with outcomes, not outputs.** "The customer can track their order in real time" not "The system exposes a WebSocket endpoint for order status updates."
- **Describe behavior the user can see and touch.** If the user can't observe it happening, it probably doesn't belong in the story description. Acceptance criteria should read like a walkthrough of someone actually using the product.
- **Use plain business language.** Avoid database tables, API endpoints, code patterns, service names, or architecture terms. A stakeholder or QA tester who has never seen the codebase should be able to read any story and understand exactly what "done" looks like.
- **Name real personas.** Instead of "As a user", write "As a returning customer", "As a hiring manager", "As a warehouse operator" — whoever the actual person is. Draw these from the problem statement in `spec.md`.
- **Frame technical work as enablement.** When a task from `tasks.md` is purely infrastructure (e.g., CI setup, database migration), translate it into the user-facing capability it enables. Only use "As a developer" when the developer IS the end user of the feature.

### Language examples

| Instead of this (too technical) | Write this (product owner voice) |
|---|---|
| "API returns 200 with paginated JSON response" | "Search results load quickly and the user can browse through pages of results" |
| "Database migration adds `status` column to orders table" | "Order status is visible to the customer at every stage" |
| "Redis cache invalidates after 5 min TTL" | "The customer always sees up-to-date information (refreshed within 5 minutes)" |
| "JWT token is issued on successful authentication" | "The user stays logged in securely across sessions" |
| "Webhook fires on payment completion" | "The seller is notified immediately when a payment is received" |

## Boundaries

- Story generation only — does not modify the source `spec.md` or `tasks.md`
- Never include implementation details, architecture decisions, or code references in the story body
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
   - `## Durable Decisions` for constraints that shape stories (but translate them into user-facing impact)
   - `## Must-Fail Gates` for stop/rollback conditions (express as "what the user should never experience")
   - `## Out of Scope` to know what NOT to write stories for
2. Read `.flow/features/<slug>/tasks.md` — extract:
   - Phase structure (N.M numbered tasks) — use for sequencing and dependencies only
   - Verification checklists per phase — translate technical checks into user-observable outcomes
   - File references — use internally for traceability but do NOT surface in story content
3. Read `.flow/memory/overview.md` (if present) for project-wide context
4. If equivalent stories already exist, warn user and ask whether to overwrite or append

## Story Derivation Rules

The goal is to produce stories that describe **valuable increments of user-facing capability**. Each story should deliver something a real person can see, use, or benefit from.

### Mapping tasks to stories

- Group tasks by the **user outcome** they collectively deliver, not by technical layer
- A phase in `tasks.md` that touches backend + frontend + tests for one user capability = one story
- Split when a phase delivers multiple distinct things a user would notice separately
- Purely technical tasks (CI, infra, migrations) should be folded into the story they enable — they don't get their own story unless the developer IS the end user
- Never create a story with zero acceptance criteria — if you can't describe what "done" looks like to a user, the story is too vague or too technical

### Story sizing

- Each story should be completable in 1–3 days of work
- If a story feels larger, split it along user-outcome boundaries and note the dependency
- If a story feels trivially small (< 2 hours), consider merging with a related story

### Acceptance criteria derivation

- Start from `## Acceptance Checks` in `spec.md` — rewrite any technical checks into user-observable behaviors
- Translate verification checklists from `tasks.md` into what the user sees, not what the system does
- Draw from `## Key Scenarios` — these are already in trigger/outcome format, which maps naturally to Given/When/Then
- Add realistic edge cases from the user's perspective: what happens when they make a mistake, lose connectivity, enter unexpected data
- Each criterion must be verifiable by someone who has never seen the codebase — describe it as a product walkthrough, not a test script

## Quiz Before Writing

Before generating story files, present the proposed story list to the user:

- Numbered list with story title + 1-line user outcome
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

**As a** <specific persona>,
**I want** <capability described in the user's own language>,
**So that** <tangible business value or personal benefit>.

## Context

<2-4 sentences written in plain language. Explain WHY this matters to the
user. What problem does this solve for them? What can they do after this
that they couldn't do before? Reference any business rules or constraints
that affect the experience — but describe them as the user would
understand them, not as technical decisions.>

## Acceptance Criteria

| # | Scenario | Given | When | Then |
|---|----------|-------|------|------|
| 1 | <user-friendly name> | <situation the user is in> | <action the user takes> | <what the user sees or experiences> |
| 2 | <user-friendly name> | <situation the user is in> | <action the user takes> | <what the user sees or experiences> |
| ... | | | | |

## What Could Go Wrong

| # | Situation | What the User Should Experience |
|---|-----------|-------------------------------|
| 1 | <realistic problem from the user's perspective> | <graceful outcome the user sees> |
| ... | | |

## Dependencies

- **Needs to be done first:** <US-NNN title or "none">
- **Enables:** <US-NNN title or "none">

## Business Rules & Constraints

<Any non-obvious rules that affect this story — rate limits described as
"max 3 attempts", data retention described as "history available for 90 days",
permission rules described as "only team admins can do this".
Write "none" if there are no special rules.>

## Story Size

**Estimate:** <S / M / L>
**Priority:** <Must-have / Should-have / Nice-to-have>

---
*Source: `.flow/features/<slug>/spec.md` · `.flow/features/<slug>/tasks.md`*
```

3. Write `stories/index.md` with:

```markdown
# User Stories: <Feature Title>

> Generated from `.flow/features/<slug>/spec.md` and `tasks.md`

## Summary

| Story | Title | Persona | Priority | Size | Status |
|-------|-------|---------|----------|------|--------|
| US-001 | <title> | <persona> | Must/Should/Nice | S/M/L | Draft |
| US-002 | <title> | <persona> | Must/Should/Nice | S/M/L | Draft |
| ... | | | | | |

## Suggested Sequence

<List stories in recommended delivery order, explained in plain language.
e.g.: "Start with US-001 (login) since everything else depends on users
being able to sign in. US-002 and US-003 can be built at the same time.
US-004 should come last since it builds on all the others.">

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

- **No technical language in stories.** Never mention APIs, endpoints, databases, schemas, migrations, caches, queues, services, or code patterns in story content. If you catch yourself writing something a non-developer wouldn't understand, rewrite it as the user-visible behavior it produces.
- Every acceptance check from `spec.md` must appear in at least one story — verify this in `index.md`
- Stories must be sliced by user outcome — never "build all the backend first, then all the frontend"
- Each story must have at least 2 acceptance criteria in Given/When/Then format
- Given/When/Then must describe user actions and observations, not system internals ("user sees a confirmation" not "server returns 201")
- Never invent requirements not traceable to `spec.md` or `tasks.md`
- Keep story titles short (< 10 words) and written from the user's perspective — they become Jira ticket titles
- Use consistent numbering: US-001, US-002, etc. (zero-padded to 3 digits)
- Personas must be specific real roles drawn from the problem domain, not generic "user" or "admin" (unless there truly is only one user type)
- "What Could Go Wrong" section can say "none" but cannot be omitted
- Dependencies section must always be present — "none" is a valid value
- Business Rules section must always be present — "none" is a valid value
- Unresolved ambiguity → `AskQuestion`, never guess
