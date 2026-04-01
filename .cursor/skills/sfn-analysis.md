# Step Function Analysis Skill

## Purpose

Reusable guide for analyzing ANY step function ASL file in `step_functions/`
and extracting structured migration artifacts into `migration-analysis/`.

---

## Common Lambda Call Pattern (crm-common-api-handler)

Every Task state calling crm-common-api-handler has these fields:

- **Type**: Task
- **Resource**: arn:aws:states:::lambda:invoke
- **Arguments.FunctionName**: contains "common-api-c1" in the ARN
- **Arguments.Payload.inputBody**:
  - **apiParamName**: a string constant like "get-memberships-benefits" (this is the DynamoDB lookup key)
  - **method**: "GET" or "POST"
  - **queryParams**: object with key-value pairs, values often use `{% $request.someField %}` syntax
  - **body**: object for POST requests, same template syntax
- **Arguments.Payload.headers**: usually `{% $headers %}` (passed through from execution input)
- **Retry**: array of retry configs (ErrorEquals, IntervalSeconds, MaxAttempts, BackoffRate, JitterStrategy)
- **Output**: THIS IS WHERE BUSINESS LOGIC HIDES — contains {% %} expressions with transforms

---

## Resolving Final URLs

1. Extract the **apiParamName** value from the Task state's Payload.inputBody
2. Open **dynamodb-config-test.csv** in the workspace root
3. Find the row matching that apiParamName
4. The CSV gives you the domain + path = the ACTUAL external API URL
5. Combine with method, queryParams/body from the ASL to get the full call spec
6. Record everything in the service registry

---

## State Type to Workflow Step Mapping

| ASL State Type | Workflow Step Type | What to Extract |
|---|---|---|
| Task calling crm-common-api-handler | API_CALL | apiParamName, resolve URL from CSV, method, params |
| Task calling another specific Lambda | API_CALL or custom | Read that Lambda's handler code for actual logic |
| Task with SDK integration (DynamoDB) | DB_OPERATION | Table name, operation type, key schema |
| Choice | RULE_CHECK | Variable path, comparison operator, value, branch targets |
| Pass with transforms in Parameters/Output | DATA_EXTRACTION | Input fields, transform operations, output shape |
| Pass simple (just forwarding) | DATA_EXTRACTION | Result and ResultPath |
| Map | RUN_WORKFLOW | Iterator config, item path, sub-flow definition |
| Parallel | FLAG — NOT SUPPORTED | Document all branches, needs manual decomposition plan |
| Wait | FLAG | Likely not needed in synchronous API, document why it exists |
| Succeed | Terminal | Maps to workflow completion / final response |
| Fail | Terminal | Maps to FAIL_JOB outcome with error details |

---

## Output Block Analysis — Where Business Logic Hides

This is the MOST IMPORTANT part of the analysis. When a Task or Pass state has an
Output block containing {% %} expressions, it is doing data transformation that
needs to become a separate DATA_EXTRACTION workflow step.

### Step A — Identify the raw data source

The response from crm-common-api-handler is deeply nested. The typical path to
actual data is:

    states.result.Payload.body.apiResponse.responseBody.{actual data}

Document the full path to the data being read.

### Step B — List every transform operation

Look for these patterns:

- $filter(array, function) — array filtering, often with date comparisons
- $toMillis(dateValue, formatString) — converting date strings to epoch for comparison
- $uppercase(string) — string normalization
- $format(value, pattern) — date or number formatting
- $DATE_FORMAT_DD_MN3_YYYY — date format constants
- Null coalescing — patterns like (expDate = null or expDate >= now)
- Array indexing — [0] to pick first match after filtering
- Field extraction — cherry-picking specific fields into a new object
- Inline function definitions — function($item) { ... } used with $filter

### Step C — Document the output shape

What fields does the transform produce? What are their types?
This becomes the storeAs contract for the DATA_EXTRACTION step.

### Step D — Rate complexity

- **Low**: Simple field rename or extraction (pick 2-3 fields from response)
- **Medium**: Filtering with simple conditions, null handling, string transforms
- **High**: Date-based filtering with $toMillis, multi-step array operations,
  nested filtering, inline function definitions (like the Membership API payer
  active-date-range pattern)

---

## Retry Configuration Mapping

ASL Retry blocks map to circuit breaker config in the workflow engine:

| ASL Retry Field | Workflow Engine Equivalent |
|---|---|
| ErrorEquals (list of error types) | Which errors trigger retry |
| IntervalSeconds | Initial retry delay |
| MaxAttempts | Max retry count |
| BackoffRate | Multiplier for exponential backoff |
| JitterStrategy ("FULL" or "NONE") | Jitter mode on retry timing |

Common Lambda error types seen in Retry blocks:
- Lambda.ServiceException
- Lambda.AWSLambdaException
- Lambda.SdkClientException
- Lambda.TooManyRequestsException

In the new API these translate to HTTP-level errors since we call external APIs
directly via common-adapter (no Lambda in between).

---

## Mapping to pharmacy-api-order-schedule

When converting to workflow steps in the target repo:

1. **Check common-adapter first** — look in pharmacy-api-order-schedule for
   existing adapters before creating new API_CALL steps. The adapter may already
   handle a specific external API.

2. **Each ASL Task with an Output block becomes TWO workflow steps:**
   - Step 1: API_CALL (fetch data via common-adapter)
   - Step 2: DATA_EXTRACTION (transform logic extracted from the Output block)

3. **Each Choice state becomes a RULE_CHECK step** with json-rules-engine
   conditions. The fact names come from the storeAs keys of earlier steps.

4. **Wire context flow:**
   - ASL ResultPath maps to storeAs on the API_CALL step
   - ASL InputPath and variable references map to $.references on dependent steps
   - ASL Output block field names map to storeAs on the DATA_EXTRACTION step
