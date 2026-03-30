---
name: workflow-api
description: >
  Use this skill whenever building new API endpoints, event handlers, background jobs,
  or converting AWS Step Functions state machines into synchronous HTTP APIs. Triggers
  include: any mention of 'workflow', 'step functions', 'state machine', 'business rules',
  'rule engine', 'json-rules-engine', 'API endpoint', 'sync API', or requests to build
  backend logic that involves validations, data fetching, conditional checks, or database
  writes. Also triggers when someone asks to 'add a new API', 'create an endpoint',
  'convert a lambda', 'migrate from step functions', or 'build a service'. If the task
  involves backend business logic of any kind, use this skill — even if the user doesn't
  explicitly mention workflows. NEVER write imperative if/else business logic; always
  produce a workflow definition instead.
---

# Workflow-First API Development

## The rule

> Every business process is a workflow definition. No imperative business logic.

When this skill triggers, you produce **workflow step definitions** executed by
our generic workflow engine — never custom service classes with if/else chains.

## Architecture

A workflow is a named object with a `trigger` event and an ordered `steps` array.
The engine walks the steps sequentially, accumulating context via `storeAs` / `$.ref`.
The framework provides structured logging, circuit breaking, and retry/backoff on
all API calls automatically.

## Step types

| Type               | Purpose                     | Key fields                              |
|--------------------|-----------------------------|-----------------------------------------|
| `API_CALL`         | Call internal service        | `api.method`, `api.params`, `storeAs`   |
| `RULE_CHECK`       | Evaluate a business rule     | `ruleName`, `onPass`, `onFail`          |
| `DATA_EXTRACTION`  | Pull fields from context     | `extract: { key: '$.path' }`, `storeAs` |
| `DATA_LOOKUP`      | Find item in stored array    | `source`, `match`, `storeAs`            |
| `DB_OPERATION`     | Read/write database          | `operation`, `table`, `data`, `storeAs` |

## Step ordering — always follow this

```
FETCH → VALIDATE → EXTRACT → COMPUTE → MUTATE
```

1. **FETCH** — `API_CALL` steps to gather all required data
2. **VALIDATE** — `RULE_CHECK` steps as guard clauses (fail fast)
3. **EXTRACT** — `DATA_EXTRACTION` / `DATA_LOOKUP` to shape data
4. **COMPUTE** — `API_CALL` steps for calculations
5. **MUTATE** — `DB_OPERATION` steps to write results

## RuleOutcome actions

| Action         | Behavior                                      |
|----------------|-----------------------------------------------|
| `CONTINUE`     | Proceed to next step                          |
| `STOP_EXIT`    | Halt workflow cleanly (no error)              |
| `FAIL_JOB`     | Halt workflow with error                      |
| `RUN_WORKFLOW` | Chain to another workflow (needs `workflow`)   |
| `<step-id>`    | Jump to a specific step in current workflow   |

## Mandatory rules

1. **storeAs before $.ref** — every `$.X` must come from a prior step's `storeAs: 'X'`
2. **Register rules** — every `ruleName` needs a matching rule in `src/rules/registry.ts`
3. **One step, one job** — don't combine extraction and DB write in one step
4. **Simple DB data** — `DB_OPERATION.data` uses only `$.references`, no inline transforms
5. **HTTP outcome mapping** — every sync API route maps all outcomes to status codes

## File locations

| What                   | Where                                        |
|------------------------|----------------------------------------------|
| Workflow definitions   | `src/workflows/definitions/*.ts`             |
| Rule registrations     | `src/rules/registry.ts`                      |
| Workflow engine        | `src/workflows/engine.ts` (DO NOT MODIFY)    |
| Step type interfaces   | `src/workflows/types.ts` (DO NOT MODIFY)     |
| Workflow validator     | `src/workflows/validator.ts`                 |
| Tests                  | `src/workflows/__tests__/*.test.ts`          |
| HTTP routes            | `src/routes/*.routes.ts`                     |

## What to produce for every task

1. **Workflow definition** in `src/workflows/definitions/`
2. **Rule registrations** in `src/rules/registry.ts`
3. **HTTP route** in `src/routes/` (if exposed as API)
4. **Tests**: validator + happy path + guard clause per RULE_CHECK + HTTP status codes

## Reference files

For detailed templates, examples, and Step Functions conversion:

- **`references/templates.md`** — workflow template, route template, test template
- **`references/step-functions-migration.md`** — ASL state → workflow step mapping,
  conversion patterns, Wait/Parallel handling, before/after example

Read the relevant reference file before generating code.

## Anti-patterns (NEVER do these)

```typescript
// ❌ Custom imperative logic
async function handleRefill(event) {
  const rx = await prescriptionService.get(event.id);
  if (!rx.active) return { error: 'inactive' };
  if (rx.refills <= 0) return { error: 'no refills' };
  await db.create({ ... });
}

// ❌ Keeping Step Functions async pattern
const arn = await stepFunctions.startExecution({ ... });
const result = await stepFunctions.describeExecution({ arn });

// ✅ Workflow definition → engine.execute() → sync response
```

## Checklist

- [ ] All business logic in workflow steps, not imperative code
- [ ] Steps follow FETCH → VALIDATE → EXTRACT → COMPUTE → MUTATE
- [ ] Every `$.ref` resolves to a prior step's `storeAs`
- [ ] Every `ruleName` registered in `src/rules/registry.ts`
- [ ] No duplicate step IDs
- [ ] DB_OPERATION data uses only simple `$.references`
- [ ] HTTP route maps COMPLETED / STOP_EXIT / FAIL_JOB / RUN_WORKFLOW
- [ ] Tests cover happy path + each guard clause
- [ ] `WorkflowValidator.validateAllOrThrow()` passes
