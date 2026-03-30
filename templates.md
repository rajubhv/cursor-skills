# Workflow Templates Reference

## Workflow definition template

```typescript
import { WORKFLOW_RULES_TYPES } from '../types';

export const yourWorkflow = {
  'your-workflow-name': {
    trigger: 'your-trigger-event',
    steps: [
      // ── PHASE 1: FETCH ──
      {
        id: 'fetch-primary-data',
        type: WORKFLOW_RULES_TYPES.API_CALL,
        api: {
          method: 'service.getResource',
          params: ['$.event.detail.properties.resourceId'],
        },
        storeAs: 'primaryData',
      },

      // ── PHASE 2: VALIDATE ──
      {
        id: 'check-precondition-a',
        type: WORKFLOW_RULES_TYPES.RULE_CHECK,
        ruleName: 'domain.precondition-a',
        onFail: { action: 'STOP_EXIT' },
        onPass: { action: 'CONTINUE' },
      },
      {
        id: 'check-precondition-b',
        type: WORKFLOW_RULES_TYPES.RULE_CHECK,
        ruleName: 'domain.precondition-b',
        onFail: { action: 'STOP_EXIT' },
        onPass: { action: 'CONTINUE' },
      },

      // ── PHASE 3: EXTRACT ──
      {
        id: 'extract-details',
        type: WORKFLOW_RULES_TYPES.DATA_EXTRACTION,
        extract: {
          fieldA: '$.primaryData.nested.fieldA',
          fieldB: '$.primaryData.nested.fieldB',
        },
        storeAs: 'extractedDetails',
      },

      // ── PHASE 4: COMPUTE ──
      {
        id: 'compute-derived-value',
        type: WORKFLOW_RULES_TYPES.API_CALL,
        api: {
          method: 'service.computeSomething',
          params: ['$.extractedDetails.fieldA'],
        },
        storeAs: 'computedValue',
      },

      // ── PHASE 5: MUTATE ──
      {
        id: 'create-record',
        type: WORKFLOW_RULES_TYPES.DB_OPERATION,
        operation: 'create',
        table: 'your-table',
        data: {
          fieldA: '$.extractedDetails.fieldA',
          fieldB: '$.extractedDetails.fieldB',
          computed: '$.computedValue',
          status: 'CREATED',
          events: ['$.event'],
        },
        storeAs: 'createdRecord',
      },
    ],
  },
};
```

## HTTP route template

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { workflowEngine } from '../workflows/engine';

const router = Router();

router.post('/api/v1/your-resource', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Validate request
    const { resourceId } = req.body;
    if (!resourceId) {
      return res.status(400).json({ error: 'Missing required field: resourceId' });
    }

    // 2. Build event from HTTP request
    const event = {
      type: 'your-trigger-event',
      detail: {
        timestamp: new Date().toISOString(),
        properties: {
          resourceId,
          ...req.body,
        },
      },
    };

    // 3. Execute workflow synchronously
    const result = await workflowEngine.execute('your-workflow-name', event);

    // 4. Map outcome to HTTP response
    if (result.chainedTo) {
      // Handle RUN_WORKFLOW branches
      switch (result.chainedTo) {
        case 'your-denial-workflow':
          return res.status(200).json({
            success: false,
            status: 'DENIED',
            reason: result.context.denial?.reason,
          });
        case 'your-pending-workflow':
          return res.status(202).json({
            success: true,
            status: 'PENDING',
            trackingId: result.context.pendingRecord?.id,
          });
      }
    }

    switch (result.outcome) {
      case 'COMPLETED':
        return res.status(201).json({
          success: true,
          data: result.context.createdRecord,
        });
      case 'STOP_EXIT':
        return res.status(200).json({
          success: false,
          reason: result.stoppedAt,
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

## Test template

```typescript
import { WorkflowValidator } from '../validator';
import { WorkflowEngine } from '../engine';
import { yourWorkflow } from '../definitions/your-workflow';
import { ruleEngine } from '../../rules/registry';

// ── Mock data ──

const mockEvent = {
  type: 'your-trigger-event',
  detail: {
    timestamp: '2026-03-29T10:00:00Z',
    properties: { resourceId: 'res-123' },
  },
};

const mockPrimaryData = {
  nested: { fieldA: 'value-a', fieldB: 'value-b' },
  status: 'active',
};

function createMockApiResolver(overrides: Record<string, any> = {}) {
  return async (method: string, params: any[]) => {
    const defaults: Record<string, any> = {
      'service.getResource': mockPrimaryData,
      'service.computeSomething': 42,
    };
    return { ...defaults, ...overrides }[method] ?? null;
  };
}

// ── 1. Validator tests ──

describe('your-workflow: validation', () => {
  it('passes startup validation', () => {
    const validator = new WorkflowValidator(yourWorkflow, ruleEngine);
    const result = validator.validateAll();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ── 2. Happy path test ──

describe('your-workflow: happy path', () => {
  it('creates record with correct data', async () => {
    const dbSpy = jest.fn();
    const engine = new WorkflowEngine({
      workflows: yourWorkflow,
      apiResolver: createMockApiResolver(),
      dbExecutor: dbSpy,
      ruleEngine,
    });

    await engine.execute('your-workflow-name', mockEvent);

    expect(dbSpy).toHaveBeenCalledTimes(1);
    expect(dbSpy).toHaveBeenCalledWith(
      'create',
      'your-table',
      expect.objectContaining({
        fieldA: 'value-a',
        fieldB: 'value-b',
        status: 'CREATED',
      })
    );
  });
});

// ── 3. Guard clause tests (one per RULE_CHECK) ──

describe('your-workflow: guard clauses', () => {
  it('halts when precondition-a fails', async () => {
    const dbSpy = jest.fn();
    const engine = new WorkflowEngine({
      workflows: yourWorkflow,
      apiResolver: createMockApiResolver({
        'service.getResource': { ...mockPrimaryData, status: 'inactive' },
      }),
      dbExecutor: dbSpy,
      ruleEngine,
    });

    const result = await engine.execute('your-workflow-name', mockEvent);

    expect(result.outcome).toBe('STOP_EXIT');
    expect(result.stoppedAt).toBe('check-precondition-a');
    expect(dbSpy).not.toHaveBeenCalled();
  });

  // Repeat for each RULE_CHECK step...
});

// ── 4. HTTP route tests ──

describe('POST /api/v1/your-resource', () => {
  it('returns 201 on successful completion', async () => {
    const response = await request(app)
      .post('/api/v1/your-resource')
      .send({ resourceId: 'res-123' });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('returns 200 with success:false on guard clause stop', async () => {
    // mock rule to fail...
    const response = await request(app)
      .post('/api/v1/your-resource')
      .send({ resourceId: 'res-inactive' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.reason).toBeDefined();
  });

  it('returns 400 on missing required fields', async () => {
    const response = await request(app)
      .post('/api/v1/your-resource')
      .send({});

    expect(response.status).toBe(400);
  });
});
```

## Rule registration template

```typescript
// src/rules/registry.ts
import { Engine } from 'json-rules-engine';

const engine = new Engine();

// Register rules referenced by workflow RULE_CHECK steps.
// The 'name' field MUST match the 'ruleName' in the workflow step.

engine.addRule({
  name: 'domain.precondition-a',
  conditions: {
    all: [
      {
        fact: 'status',
        operator: 'equal',
        value: 'active',
      },
    ],
  },
  event: { type: 'precondition-a-passed' },
});

engine.addRule({
  name: 'domain.precondition-b',
  conditions: {
    all: [
      {
        fact: 'count',
        operator: 'greaterThan',
        value: 0,
      },
    ],
  },
  event: { type: 'precondition-b-passed' },
});

export { engine as ruleEngine };
```
