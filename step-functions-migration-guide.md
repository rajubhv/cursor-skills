# Step Functions → Workflow Migration Guide
#
# Append this to your .cursorrules file so Cursor AI knows how to
# convert AWS Step Functions state machines into workflow definitions
# exposed as synchronous HTTP APIs.

## CRITICAL: Step Functions Migration Context

This project is migrating AWS Step Functions (ASL) state machines into our
internal workflow engine, exposed as **synchronous HTTP endpoints**. When you
encounter Step Functions code (ASL JSON/YAML, CDK StepFunctions constructs,
or SAM/CloudFormation state machine definitions), convert them to our workflow
step format. NEVER preserve the Step Functions async/callback pattern.

## State Type → Step Type Mapping

| Step Functions State  | Workflow Step Type    | Notes                                      |
|-----------------------|----------------------|--------------------------------------------|
| `Task` (Lambda)       | `API_CALL`           | Lambda body → service method               |
| `Task` (DynamoDB)     | `DB_OPERATION`       | GetItem/PutItem/Query → read/create/query  |
| `Task` (SQS/SNS)     | `API_CALL`           | Messaging → notification service method    |
| `Task` (HTTP)         | `API_CALL`           | HTTP invoke → service method wrapping call |
| `Choice`              | `RULE_CHECK`         | Each choice rule → separate RULE_CHECK     |
| `Pass`                | `DATA_EXTRACTION`    | InputPath/ResultPath/Parameters → extract  |
| `Wait`                | REMOVE               | Not needed in sync flow (see notes below)  |
| `Parallel`            | FLATTEN              | Convert branches to sequential steps       |
| `Map`                 | API_CALL             | Iterator → service method with batch param |
| `Succeed`             | (implicit)           | Last step completes = success              |
| `Fail`                | RULE_CHECK onFail    | Use `{ action: 'FAIL_JOB' }`              |

## ASL Field → Workflow Field Mapping

### InputPath / ResultPath / OutputPath → storeAs + $.references

```
Step Functions:
  "InputPath": "$.prescription",
  "ResultPath": "$.validationResult",
  "OutputPath": "$.validationResult.body"

Workflow:
  Step that produced the data:  storeAs: 'prescription'
  Step that consumes it:        '$.prescription.fieldName'
  Step that stores result:      storeAs: 'validationResult'
```

### Parameters → DATA_EXTRACTION

```
Step Functions:
  "Parameters": {
    "prescriptionId.$": "$.event.prescriptionId",
    "patientName.$": "$.patientData.name",
    "status": "ACTIVE"
  }

Workflow:
  {
    id: 'extract-params',
    type: WORKFLOW_RULES_TYPES.DATA_EXTRACTION,
    extract: {
      prescriptionId: '$.event.prescriptionId',
      patientName: '$.patientData.name',
    },
    storeAs: 'extractedParams',
  }
```

### Choice → RULE_CHECK chain

```
Step Functions:
  "Type": "Choice",
  "Choices": [
    {
      "Variable": "$.status",
      "StringEquals": "ACTIVE",
      "Next": "ProcessRefill"
    },
    {
      "Variable": "$.refillsRemaining",
      "NumericGreaterThan": 0,
      "Next": "ProcessRefill"
    }
  ],
  "Default": "RejectRequest"

Workflow:
  {
    id: 'check-status-active',
    type: WORKFLOW_RULES_TYPES.RULE_CHECK,
    ruleName: 'prescription.is-active',
    onPass: { action: 'CONTINUE' },
    onFail: { action: 'STOP_EXIT' },
  },
  {
    id: 'check-refills-remaining',
    type: WORKFLOW_RULES_TYPES.RULE_CHECK,
    ruleName: 'prescription.has-refills',
    onPass: { action: 'CONTINUE' },
    onFail: { action: 'STOP_EXIT' },
  },
```

### Retry / Catch → Framework handles this

```
Step Functions:
  "Retry": [
    { "ErrorEquals": ["ServiceUnavailable"], "MaxAttempts": 3 }
  ],
  "Catch": [
    { "ErrorEquals": ["States.ALL"], "Next": "HandleError" }
  ]

Workflow:
  // API_CALL framework handles circuit breaking and backoff.
  // No explicit retry config needed in workflow definition.
  // For error routing, use RULE_CHECK with onFail: { action: 'FAIL_JOB' }
```

### Parallel → Sequential flatten

```
Step Functions:
  "Type": "Parallel",
  "Branches": [
    { "States": { "FetchPatient": { ... } } },
    { "States": { "FetchInsurance": { ... } } }
  ]

Workflow:
  // Flatten to sequential. If true parallelism is needed,
  // create a service method that does the parallel fetch
  // and expose it as a single API_CALL step.
  {
    id: 'fetch-patient',
    type: WORKFLOW_RULES_TYPES.API_CALL,
    api: { method: 'patient.getProfile', params: ['$.event.patientId'] },
    storeAs: 'patient',
  },
  {
    id: 'fetch-insurance',
    type: WORKFLOW_RULES_TYPES.API_CALL,
    api: { method: 'insurance.getCoverage', params: ['$.event.insuranceId'] },
    storeAs: 'insurance',
  },

  // OR if latency matters, combine into one service method:
  {
    id: 'fetch-patient-and-insurance',
    type: WORKFLOW_RULES_TYPES.API_CALL,
    api: {
      method: 'patient.getProfileWithInsurance',
      params: ['$.event.patientId', '$.event.insuranceId'],
    },
    storeAs: 'patientBundle',
  },
```

### Wait → Remove or convert to computed date

```
Step Functions:
  "Type": "Wait",
  "Seconds": 300,
  "Next": "CheckStatus"

Workflow:
  // In a sync HTTP flow, Wait states don't make sense.
  // If the wait is for a future scheduled action, compute
  // the target timestamp and store it:
  {
    id: 'compute-scheduled-time',
    type: WORKFLOW_RULES_TYPES.API_CALL,
    api: {
      method: 'scheduling.computeTargetTime',
      params: ['$.event.timestamp', 300],
    },
    storeAs: 'scheduledTime',
  },
```

## Converting the HTTP Layer

### Step Functions pattern (REMOVE)
```
API Gateway → Step Functions (async) → Lambda → Lambda → ...
  ↓
Execution ARN returned
  ↓
Client polls DescribeExecution
```

### Workflow pattern (REPLACE WITH)
```
Express/Fastify route → WorkflowEngine.execute() → Response
```

### Route template

```typescript
// src/routes/your-domain.routes.ts
import { Router } from 'express';
import { workflowEngine } from '../workflows/engine';

const router = Router();

router.post('/api/v1/prescriptions/:id/refill', async (req, res, next) => {
  try {
    // 1. Build the event from the HTTP request
    const event = {
      type: 'refill-requested-event',
      detail: {
        timestamp: new Date().toISOString(),
        properties: {
          prescriptionResourceId: req.params.id,
          patientId: req.body.patientId,
          ...req.body,
        },
      },
    };

    // 2. Execute the workflow synchronously
    const result = await workflowEngine.execute(
      'refill-requested-workflow',
      event
    );

    // 3. Map workflow outcome to HTTP response
    switch (result.outcome) {
      case 'COMPLETED':
        return res.status(201).json({
          success: true,
          data: result.context.refillRequest, // final storeAs value
        });

      case 'STOP_EXIT':
        return res.status(200).json({
          success: false,
          reason: result.stoppedAt,          // which guard clause stopped it
          message: result.stopReason,
        });

      case 'FAIL_JOB':
        return res.status(422).json({
          success: false,
          error: result.failReason,
        });

      default:
        return res.status(500).json({ error: 'Unknown workflow outcome' });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
```

## Conversion Checklist

When converting a Step Functions state machine:

- [ ] Identify all states and map to step types using the table above
- [ ] Extract Lambda function bodies into service methods
- [ ] Convert Choice states to RULE_CHECK steps with registered rules
- [ ] Replace InputPath/ResultPath with storeAs/$.references
- [ ] Remove Wait states (compute timestamps instead)
- [ ] Flatten Parallel branches to sequential (or batch service method)
- [ ] Remove Retry/Catch (framework handles this)
- [ ] Create the HTTP route with event building + outcome mapping
- [ ] Register all rules in src/rules/registry.ts
- [ ] Run workflow validator
- [ ] Write tests (validator + happy path + guard clauses)

## What to tell Cursor

When prompting Cursor to convert Step Functions, use:

```
Convert this Step Functions state machine to our workflow format.
Follow .cursorrules and the Step Functions migration guide.
Create:
1. The workflow definition in src/workflows/definitions/
2. Register rules in src/rules/registry.ts
3. The HTTP route in src/routes/
4. Tests in src/workflows/__tests__/
```
