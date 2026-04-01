# Migration Playbook — 6 Phases

Follow these phases IN ORDER for each step function.
ASL files are in: step_functions/
DynamoDB mapping is in: dynamodb-config-test.csv
Common Lambda is in: crm-common-api-handler/
Target repo is: pharmacy-api-order-schedule/
Analysis output goes in: migration-analysis/<step-function-name>/

---

## Phase 1: State Inventory
Read the ASL file. List every state:
- Name, type, 1-line summary
- Next state(s)
- Has Output/Parameters transform? (yes/no)
- Has Retry/Catch? (yes/no)
→ Output: analysis/logic-map.md (State Inventory + Happy Path sections)

## Phase 2: API Call Catalog
Find every Task state calling crm-common-api-handler. Extract:
- apiParamName → look up in dynamodb-config-test.csv → final URL
- method, queryParams/body (note {% %} template expressions)
- Retry config (attempts, interval, backoff, jitter)
- Response envelope path
→ Output: analysis/service-registry.md

## Phase 3: Transform Inventory
Find every state with Output/Parameters/ResultSelector containing {% %}. For each:
- Raw data read path (through response envelope)
- Transform logic in plain English
- Output shape
- Complexity rating
→ Output: analysis/transform-inventory.md

## Phase 4: Decision Logic
Find all Choice states. For each:
- What variable, from which earlier state
- Every comparison rule + target
- Nested Choice chains
- Default branch
→ Output: analysis/rules-inventory.md

## Phase 5: Flow Segmentation
Using Phase 1-4 outputs, identify independent segments:
- Segment = fetch → validate → transform → decide
- Each segment → potential RUN_WORKFLOW sub-workflow
→ Output: analysis/logic-map.md (Segments section)

## Phase 6: Conversion
Per segment, create workflow steps in pharmacy-api-order-schedule:
- API_CALL using common-adapter (check existing adapters first)
- DATA_EXTRACTION (from transform inventory)
- RULE_CHECK (from rules inventory, json-rules-engine format)
- Wire storeAs / $.references
→ Output: pharmacy-api-order-schedule/src/workflows/