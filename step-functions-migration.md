# Step Functions → Workflow Migration Reference

## State type mapping

| Step Functions State  | Workflow Step Type    | Notes                                      |
|-----------------------|----------------------|--------------------------------------------|
| `Task` (Lambda)       | `API_CALL`           | Lambda body → service method               |
| `Task` (DynamoDB)     | `DB_OPERATION`       | GetItem/PutItem → read/create              |
| `Task` (SQS/SNS)     | `API_CALL`           | Messaging → notification service method    |
| `Task` (HTTP)         | `API_CALL`           | HTTP invoke → service method wrapping call |
| `Choice`              | `RULE_CHECK`         | Each choice rule → separate RULE_CHECK     |
| `Pass`                | `DATA_EXTRACTION`    | Parameters → extract                       |
| `Wait`                | REMOVE               | Compute timestamp or return PENDING        |
| `Parallel`            | FLATTEN              | Sequential steps or batch service method   |
| `Map`                 | `API_CALL`           | Iterator → service method with batch param |
| `Succeed`             | (implicit)           | Last step completes = success              |
| `Fail`                | RULE_CHECK onFail    | `{ action: 'FAIL_JOB' }`                  |

## Field mapping

### InputPath / ResultPath / OutputPath → storeAs + $.references

```
Step Functions:
  "InputPath": "$.prescription",
  "ResultPath": "$.validationResult"

Workflow:
  Previous step:  storeAs: 'prescription'
  This step:      params: ['$.prescription.fieldName']
  This step:      storeAs: 'validationResult'
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

Each Choice branch becomes a separate RULE_CHECK step.
The `Default` path maps to the final `onFail` action.

```
Step Functions:
  "Type": "Choice",
  "Choices": [
    { "Variable": "$.status", "StringEquals": "ACTIVE", "Next": "Process" },
    { "Variable": "$.refills", "NumericGreaterThan": 0, "Next": "Process" }
  ],
  "Default": "Reject"

Workflow:
  {
    id: 'check-status-active',
    type: WORKFLOW_RULES_TYPES.RULE_CHECK,
    ruleName: 'resource.is-active',
    onPass: { action: 'CONTINUE' },
    onFail: { action: 'STOP_EXIT' },
  },
  {
    id: 'check-has-refills',
    type: WORKFLOW_RULES_TYPES.RULE_CHECK,
    ruleName: 'resource.has-refills',
    onPass: { action: 'CONTINUE' },
    onFail: { action: 'STOP_EXIT' },
  },
```

### Retry / Catch → Remove

Framework handles circuit breaking and backoff. No explicit config needed.

```
Step Functions:
  "Retry": [{ "ErrorEquals": ["ServiceUnavailable"], "MaxAttempts": 3 }],
  "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "HandleError" }]

Workflow:
  // Removed. Framework handles this automatically.
  // For error routing, use RULE_CHECK with onFail: { action: 'FAIL_JOB' }
```

### Parallel → Flatten or batch

```
Step Functions:
  "Type": "Parallel",
  "Branches": [
    { "States": { "FetchA": { ... } } },
    { "States": { "FetchB": { ... } } }
  ]

Workflow (sequential):
  { id: 'fetch-a', type: API_CALL, ..., storeAs: 'dataA' },
  { id: 'fetch-b', type: API_CALL, ..., storeAs: 'dataB' },

Workflow (batch — if latency critical):
  {
    id: 'fetch-all',
    type: API_CALL,
    api: { method: 'service.batchFetch', params: ['$.idA', '$.idB'] },
    storeAs: 'batchResult',
  },
```

### Wait → Remove or compute

```
Step Functions:
  "Type": "Wait", "Seconds": 86400, "Next": "CheckStatus"

Workflow:
  // Option A: compute target timestamp and return immediately
  {
    id: 'compute-scheduled-time',
    type: WORKFLOW_RULES_TYPES.API_CALL,
    api: { method: 'scheduling.computeTarget', params: ['$.event.timestamp', 86400] },
    storeAs: 'scheduledTime',
  },

  // Option B: save as PENDING, handle follow-up via webhook/cron
  {
    id: 'save-pending',
    type: WORKFLOW_RULES_TYPES.DB_OPERATION,
    operation: 'create',
    table: 'pending-tasks',
    data: { status: 'PENDING_REVIEW', scheduledAt: '$.scheduledTime' },
    storeAs: 'pendingRecord',
  },
```

## HTTP layer conversion

### Before: async polling
```
Client → API Gateway → Step Functions (startExecution)
  ↓
executionArn returned to client
  ↓
Client polls describeExecution until SUCCEEDED/FAILED
```

### After: sync response
```
Client → Express route → workflowEngine.execute() → JSON response
```

### Route pattern
```typescript
router.post('/api/v1/resource', async (req, res, next) => {
  try {
    const event = {
      type: 'trigger-event',
      detail: {
        timestamp: new Date().toISOString(),
        properties: { ...req.body },
      },
    };

    const result = await workflowEngine.execute('workflow-name', event);

    // Handle sub-workflow chains
    if (result.chainedTo === 'denial-workflow') {
      return res.status(200).json({ success: false, status: 'DENIED' });
    }
    if (result.chainedTo === 'pending-workflow') {
      return res.status(202).json({ success: true, status: 'PENDING' });
    }

    // Handle direct outcomes
    switch (result.outcome) {
      case 'COMPLETED':
        return res.status(201).json({ success: true, data: result.context.finalStep });
      case 'STOP_EXIT':
        return res.status(200).json({ success: false, reason: result.stoppedAt });
      case 'FAIL_JOB':
        return res.status(422).json({ error: result.failReason });
    }
  } catch (error) { next(error); }
});
```

## Complete before/after example

### Before: Prior Auth Step Functions (12 states)

```json
{
  "StartAt": "FetchPrescription",
  "States": {
    "FetchPrescription": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:fetchPrescription",
      "ResultPath": "$.prescription",
      "Retry": [{ "ErrorEquals": ["ServiceUnavailable"], "MaxAttempts": 3 }],
      "Next": "FetchInsurance"
    },
    "FetchInsurance": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:fetchInsurance",
      "ResultPath": "$.insurance",
      "Next": "CheckCoverage"
    },
    "CheckCoverage": {
      "Type": "Choice",
      "Choices": [
        { "Variable": "$.insurance.covered", "BooleanEquals": true, "Next": "CheckPriorAuth" }
      ],
      "Default": "Deny"
    },
    "CheckPriorAuth": {
      "Type": "Choice",
      "Choices": [
        { "Variable": "$.insurance.priorAuthRequired", "BooleanEquals": false, "Next": "AutoApprove" }
      ],
      "Default": "SubmitForReview"
    },
    "AutoApprove": {
      "Type": "Task", "Resource": "arn:aws:lambda:...:autoApprove",
      "ResultPath": "$.approval", "Next": "SaveRecord"
    },
    "SubmitForReview": {
      "Type": "Task", "Resource": "arn:aws:lambda:...:submit",
      "ResultPath": "$.submission", "Next": "WaitForReview"
    },
    "WaitForReview": {
      "Type": "Wait", "Seconds": 86400, "Next": "CheckStatus"
    },
    "CheckStatus": {
      "Type": "Task", "Resource": "arn:aws:lambda:...:checkStatus",
      "ResultPath": "$.review", "Next": "IsApproved"
    },
    "IsApproved": {
      "Type": "Choice",
      "Choices": [
        { "Variable": "$.review.status", "StringEquals": "APPROVED", "Next": "SaveRecord" }
      ],
      "Default": "Deny"
    },
    "SaveRecord": {
      "Type": "Task", "Resource": "arn:aws:states:::dynamodb:putItem",
      "Parameters": { "TableName": "Records", "Item": { "status": { "S": "APPROVED" } } },
      "End": true
    },
    "Deny": {
      "Type": "Task", "Resource": "arn:aws:lambda:...:deny", "Next": "SaveDenial"
    },
    "SaveDenial": {
      "Type": "Task", "Resource": "arn:aws:states:::dynamodb:putItem",
      "Parameters": { "TableName": "Records", "Item": { "status": { "S": "DENIED" } } },
      "End": true
    }
  }
}
```

### After: Three composable workflows + sync route

```typescript
export const priorAuthWorkflows = {
  // Main workflow — auto-approve path
  'prior-auth-workflow': {
    trigger: 'prior-auth-requested-event',
    steps: [
      // FETCH
      {
        id: 'fetch-prescription',
        type: WORKFLOW_RULES_TYPES.API_CALL,
        api: { method: 'prescription.get', params: ['$.event.detail.properties.prescriptionId'] },
        storeAs: 'prescription',
      },
      {
        id: 'fetch-insurance',
        type: WORKFLOW_RULES_TYPES.API_CALL,
        api: { method: 'insurance.getCoverage', params: ['$.prescription.insuranceId'] },
        storeAs: 'insurance',
      },
      // VALIDATE
      {
        id: 'check-drug-covered',
        type: WORKFLOW_RULES_TYPES.RULE_CHECK,
        ruleName: 'insurance.drug-is-covered',
        onPass: { action: 'CONTINUE' },
        onFail: { action: 'RUN_WORKFLOW', workflow: 'prior-auth-denial-workflow' },
      },
      {
        id: 'check-prior-auth-not-required',
        type: WORKFLOW_RULES_TYPES.RULE_CHECK,
        ruleName: 'insurance.prior-auth-not-required',
        onPass: { action: 'CONTINUE' },
        onFail: { action: 'RUN_WORKFLOW', workflow: 'prior-auth-submission-workflow' },
      },
      // EXTRACT
      {
        id: 'extract-approval-params',
        type: WORKFLOW_RULES_TYPES.DATA_EXTRACTION,
        extract: {
          prescriptionId: '$.prescription.prescriptionId',
          insuranceId: '$.insurance.memberId',
          drugNdc: '$.prescription.drug.ndc',
        },
        storeAs: 'approvalParams',
      },
      // COMPUTE
      {
        id: 'auto-approve',
        type: WORKFLOW_RULES_TYPES.API_CALL,
        api: { method: 'priorAuth.autoApprove', params: ['$.approvalParams'] },
        storeAs: 'approval',
      },
      // MUTATE
      {
        id: 'save-record',
        type: WORKFLOW_RULES_TYPES.DB_OPERATION,
        operation: 'create',
        table: 'prior-auth-records',
        data: {
          id: '$.prescription.prescriptionId',
          status: 'APPROVED',
          approvalId: '$.approval.approvalId',
        },
        storeAs: 'savedRecord',
      },
    ],
  },

  // Denial sub-workflow (replaces Deny + SaveDenial states)
  'prior-auth-denial-workflow': {
    trigger: 'internal',
    steps: [
      {
        id: 'process-denial',
        type: WORKFLOW_RULES_TYPES.API_CALL,
        api: { method: 'priorAuth.processDenial', params: ['$.prescription.prescriptionId'] },
        storeAs: 'denial',
      },
      {
        id: 'save-denial',
        type: WORKFLOW_RULES_TYPES.DB_OPERATION,
        operation: 'create',
        table: 'prior-auth-records',
        data: { id: '$.prescription.prescriptionId', status: 'DENIED', reason: '$.denial.reason' },
        storeAs: 'denialRecord',
      },
    ],
  },

  // Submission sub-workflow (replaces Submit + Wait + Check states)
  // Wait state removed — returns PENDING, follow-up via webhook
  'prior-auth-submission-workflow': {
    trigger: 'internal',
    steps: [
      {
        id: 'submit-for-review',
        type: WORKFLOW_RULES_TYPES.API_CALL,
        api: { method: 'priorAuth.submitForReview', params: ['$.prescription', '$.insurance'] },
        storeAs: 'submission',
      },
      {
        id: 'save-pending',
        type: WORKFLOW_RULES_TYPES.DB_OPERATION,
        operation: 'create',
        table: 'prior-auth-records',
        data: {
          id: '$.prescription.prescriptionId',
          status: 'PENDING_REVIEW',
          submissionId: '$.submission.submissionId',
        },
        storeAs: 'pendingRecord',
      },
    ],
  },
};
```

## Conversion checklist

- [ ] Map all states using the type mapping table
- [ ] Extract Lambda bodies into service methods
- [ ] Convert Choice → RULE_CHECK chain with registered rules
- [ ] Replace InputPath/ResultPath with storeAs/$.references
- [ ] Remove Wait states (compute timestamps or return PENDING)
- [ ] Flatten Parallel to sequential (or batch service method)
- [ ] Remove Retry/Catch (framework handles it)
- [ ] Create HTTP route with outcome mapping
- [ ] Register all rules in src/rules/registry.ts
- [ ] Run workflow validator
- [ ] Write tests (validator + happy path + guard clauses + HTTP)
