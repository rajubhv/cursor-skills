# Cursor Prompts Cheat Sheet

Keep this open as a reference. Copy-paste these into Cursor chat (Cmd+L).
Replace {name} with the step function name (e.g., order-scheduling).

---

## Before First Migration — One-Time Setup

### Verify Cursor can see everything

> List all files in step_functions/, crm-common-api-handler/src/, and
> pharmacy-api-order-schedule/src/. Confirm you can also read
> dynamodb-config-test.csv.

---

## Phase 1 — State Inventory

> Read the analysis skill at @.cursor/skills/sfn-analysis.md then analyze
> @step_functions/{name}.asl.json. List every state with its name, type,
> one-line summary of what it does, whether it has an Output or Parameters
> transform block, and what state(s) it transitions to. Populate the State
> Inventory table in @migration-analysis/{name}/logic-map.md. Then trace
> the happy path from StartAt through to Succeed or End.

---

## Phase 2 — API Call Catalog

> Find every Task state in @step_functions/{name}.asl.json that calls
> crm-common-api-handler (FunctionName contains "common-api-c1"). For each
> one extract the apiParamName and look it up in @dynamodb-config-test.csv
> to get the final external URL. Also extract the method, queryParams or
> body with their template expressions, headers, and the full Retry config.
> Populate @migration-analysis/{name}/service-registry.md.

---

## Phase 3 — Transform Inventory

> Find every state in @step_functions/{name}.asl.json that has an Output,
> Parameters, or ResultSelector block containing template expressions.
> For each one explain in plain English what transform it performs, what
> raw data it reads through the response envelope, what shape it outputs,
> and rate complexity as Low, Medium, or High per the analysis skill.
> Populate @migration-analysis/{name}/transform-inventory.md.

---

## Phase 4 — Decision Logic

> Find all Choice states in @step_functions/{name}.asl.json. For each one
> extract what variable it evaluates, which earlier state provided that
> data via storeAs or ResultPath, every comparison rule with its operator
> and target state, and the Default branch. If any branch leads to another
> Choice state, show the full nested decision tree. Populate
> @migration-analysis/{name}/rules-inventory.md.

---

## Phase 5 — Flow Segmentation

> Using the completed analysis files in @migration-analysis/{name}/ —
> the service registry, transform inventory, and rules inventory —
> identify logical segments. A segment is a group of states that form
> a coherent unit: fetch data, validate, transform, decide. Each segment
> is a candidate RUN_WORKFLOW sub-workflow. Update the Segments section
> of @migration-analysis/{name}/logic-map.md with each segment's states,
> input contract, and output contract.

---

## Phase 6 — Conversion (run once per segment)

> Convert Segment N from @migration-analysis/{name}/logic-map.md into
> workflow steps. First check @pharmacy-api-order-schedule/src/ for
> existing adapters in common-adapter that already call the relevant
> external APIs. Create API_CALL steps using the final URLs from the
> service registry. Create DATA_EXTRACTION steps from the transform
> inventory. Create RULE_CHECK steps from the rules inventory using
> json-rules-engine format. Wire storeAs and $.references between steps.
> Follow the conventions in @.cursor/skills/workflow-conventions.md.
> Output workflow JSON to @pharmacy-api-order-schedule/src/workflows/.

---

## Ad-Hoc Prompts — Use As Needed

### Deep dive on a single state

> Analyze the state named "{StateName}" in @step_functions/{name}.asl.json.
> Explain exactly what it does, what data it reads, what it transforms,
> and what the equivalent workflow step(s) would look like.

### Compare two step functions for shared patterns

> Compare @step_functions/{name1}.asl.json and @step_functions/{name2}.asl.json.
> Find states that call the same apiParamName or have similar Choice logic.
> List shared patterns that could become reusable workflow components.

### Check if an adapter already exists

> Search @pharmacy-api-order-schedule/ for any adapter or service that
> already calls {apiParamName or URL}. Show me what method it uses
> and what the request/response types look like.

### Validate a converted workflow against the original

> Compare the workflow at @pharmacy-api-order-schedule/src/workflows/{name}.json
> against the original states in @step_functions/{name}.asl.json. Verify that
> every API call, transform, and decision branch is accounted for. Flag anything
> missing or different.
