# Cursor Prompts Cheat Sheet

Replace {name} with the step function name (e.g., order-scheduling).

Before starting a new migration, create the analysis folder:

    mkdir -p migration-analysis/{name}
    cp migration-analysis/templates/*.md migration-analysis/{name}/

---

## Phase 1 — State Inventory

Analyze @step_functions/{name}.asl.json. List every state with its
name, type, one-line summary of what it does, whether it has an Output
or Parameters transform block, whether it has Retry/Catch, whether it
is inside a Parallel branch, and what state(s) it transitions to. For
any Parallel states, list each branch and all states within it.
Populate the State Inventory table in
@migration-analysis/{name}/logic-map.md. Then trace the happy path
from StartAt through to Succeed or End.

---

## Phase 2 — API Call Catalog

Find every Task state in @step_functions/{name}.asl.json that calls
crm-common-api-handler (FunctionName contains "common-api-c1"). For
each one extract the apiParamName and look it up in
@dynamodb-config-test.csv to get the final external URL. Also extract
the method, queryParams or body with their template expressions,
headers, and the full Retry config. Populate
@migration-analysis/{name}/service-registry.md.

---

## Phase 3 — Database Operations

Find every Task state in @step_functions/{name}.asl.json that
interacts with MongoDB Atlas. For each one extract: the collection
name, operation type (find, findOne, insertOne, updateOne, aggregate),
the query filter, what fields are returned or updated, and which
later states consume the result. List every access pattern and
propose a DynamoDB single table key schema with PK, SK, and GSIs.
Show how each MongoDB document maps to DynamoDB items. Populate
@migration-analysis/{name}/db-migration.md.

---

## Phase 4 — Transform Inventory

Find every state in @step_functions/{name}.asl.json that has an Output,
Parameters, or ResultSelector block containing template expressions.
For each one explain in plain English what transform it performs, what
raw data it reads through the response envelope, what shape it outputs,
and rate complexity as Low, Medium, or High. Populate
@migration-analysis/{name}/transform-inventory.md.

---

## Phase 5 — Decision Logic

Find all Choice states in @step_functions/{name}.asl.json. For each one
extract what variable it evaluates, which earlier state provided that
data, every comparison rule with its operator and target state, and the
Default branch. If any branch leads to another Choice state, show the
full nested decision tree. Populate
@migration-analysis/{name}/rules-inventory.md.

---

## Phase 6 — Code Structure Planning

Using all completed analysis files in @migration-analysis/{name}/,
plan the TypeScript code structure for @pharmacy-api-order-schedule/.
Group related states into service classes or modules. Identify shared
utility functions. Map each external API call to an existing
common-adapter method in @pharmacy-api-order-schedule/src/ — list
which adapters already exist and which need to be created. Define
TypeScript interfaces for all data shapes found in the service
registry, db migration, and transform inventory. Identify Parallel
branches that become Promise.all() groups. Update the Code Structure
section of @migration-analysis/{name}/logic-map.md.

---

## Phase 7 — Conversion (run once per module/service)

Convert the {ModuleName} module from
@migration-analysis/{name}/logic-map.md into TypeScript code. Use
common-adapter from @pharmacy-api-order-schedule/src/ for HTTP calls
with the final URLs from @migration-analysis/{name}/service-registry.md.
Use DynamoDB DocumentClient for database operations with the single
table schema from @migration-analysis/{name}/db-migration.md. Convert
Choice states into if/else or switch statements. Convert Output block
transforms into pure TypeScript functions using the transform inventory.
Convert Parallel states into Promise.all() with each branch as an
async function. Create TypeScript interfaces for all request/response
types. Add try/catch error handling based on the Retry configs. Write
files to @pharmacy-api-order-schedule/src/.

---

## Ad-Hoc Prompts

### Deep dive on a single state

Analyze the state named "{StateName}" in
@step_functions/{name}.asl.json. Explain exactly what it does, what
data it reads, what it transforms, and what the equivalent TypeScript
code would look like.

### Deep dive on a MongoDB operation

Analyze the state named "{StateName}" in
@step_functions/{name}.asl.json. Show the MongoDB query it runs, what
collection it targets, and the document shape. Propose the DynamoDB
single table equivalent with PK/SK schema and the TypeScript code
using DocumentClient.

### Deep dive on a Parallel state

Analyze the Parallel state named "{StateName}" in
@step_functions/{name}.asl.json. List each branch, what states are
inside each branch, what data each branch produces, and how the
results are combined. Show the equivalent TypeScript code using
Promise.all().

### Compare two step functions for shared patterns

Compare @step_functions/{name1}.asl.json and
@step_functions/{name2}.asl.json. Find states that call the same
apiParamName, share MongoDB collections, or have similar Choice logic.
List shared patterns that could become reusable TypeScript utilities.

### Check if an adapter already exists

Search @pharmacy-api-order-schedule/ for any adapter or service that
already calls the endpoint for apiParamName "{constant}". Show what
method it uses and what the request/response types look like.

### Validate converted code against the original

Compare the TypeScript code in @pharmacy-api-order-schedule/src/{path}
against the original states in @step_functions/{name}.asl.json. Verify
that every API call, DB operation, transform, and decision branch is
accounted for. Flag anything missing or different.

### Consolidate access patterns across step functions

Look at all db-migration.md files across @migration-analysis/. List
every MongoDB collection and access pattern found across ALL step
functions. Propose a unified DynamoDB single table schema that covers
all access patterns.
