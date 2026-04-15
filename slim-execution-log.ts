#!/usr/bin/env npx tsx
/**
 * Slim a Step Functions execution history into per-state I/O.
 *
 * Usage:
 *   aws stepfunctions get-execution-history --execution-arn <arn> --output json > raw.json
 *   npx tsx slim-execution-log.ts raw.json <scenario-name> [asl-file] > slim.json
 *
 * If asl-file is provided, Choice states are annotated with the branch taken.
 */

import * as fs from 'fs';

type HistoryEvent = {
  type: string;
  stateEnteredEventDetails?: { name: string; input: string };
  stateExitedEventDetails?: { name: string; output: string };
  executionStartedEventDetails?: { input: string };
  executionSucceededEventDetails?: { output: string };
  executionFailedEventDetails?: { error: string; cause: string };
  executionTimedOutEventDetails?: { error: string; cause: string };
  taskFailedEventDetails?: { error: string; cause: string };
  taskTimedOutEventDetails?: { error: string; cause: string };
  lambdaFunctionFailedEventDetails?: { error: string; cause: string };
};

const tryParse = (s?: string): unknown => {
  if (s == null) return undefined;
  try { return JSON.parse(s); } catch { return s; }
};

function loadChoiceStates(aslPath?: string): Set<string> {
  if (!aslPath || !fs.existsSync(aslPath)) return new Set();
  const asl = JSON.parse(fs.readFileSync(aslPath, 'utf8'));
  const choices = new Set<string>();
  const walk = (states: Record<string, any>) => {
    for (const [name, def] of Object.entries(states)) {
      if (def?.Type === 'Choice') choices.add(name);
      if (def?.Branches) for (const b of def.Branches) walk(b.States);
      if (def?.Iterator?.States) walk(def.Iterator.States);
      if (def?.ItemProcessor?.States) walk(def.ItemProcessor.States);
    }
  };
  walk(asl.States ?? {});
  return choices;
}

const [, , inputPath, scenario, aslPath] = process.argv;
if (!inputPath || !scenario) {
  console.error('Usage: slim-execution-log.ts <raw-history.json> <scenario-name> [asl-file]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const events: HistoryEvent[] = raw.events ?? raw;
const choiceStates = loadChoiceStates(aslPath);

const states: Array<{
  name: string;
  input: unknown;
  output?: unknown;
  branchTaken?: string;
  error?: { error: string; cause: string };
}> = [];
const enteredInputs = new Map<string, unknown>();

let execInput: unknown;
let execOutput: unknown;
let status = 'UNKNOWN';
let lastError: { error: string; cause: string } | undefined;

for (const e of events) {
  if (e.executionStartedEventDetails) execInput = tryParse(e.executionStartedEventDetails.input);
  if (e.executionSucceededEventDetails) {
    execOutput = tryParse(e.executionSucceededEventDetails.output);
    status = 'SUCCEEDED';
  }
  if (e.executionFailedEventDetails) {
    status = 'FAILED';
    execOutput = e.executionFailedEventDetails;
  }
  if (e.executionTimedOutEventDetails) {
    status = 'TIMED_OUT';
    execOutput = e.executionTimedOutEventDetails;
  }

  const taskErr = e.taskFailedEventDetails ?? e.taskTimedOutEventDetails ?? e.lambdaFunctionFailedEventDetails;
  if (taskErr) lastError = { error: taskErr.error, cause: taskErr.cause };

  if (e.stateEnteredEventDetails) {
    enteredInputs.set(e.stateEnteredEventDetails.name, tryParse(e.stateEnteredEventDetails.input));
  }
  if (e.stateExitedEventDetails) {
    const name = e.stateExitedEventDetails.name;
    const slim: typeof states[number] = {
      name,
      input: enteredInputs.get(name),
      output: tryParse(e.stateExitedEventDetails.output),
    };
    if (lastError) { slim.error = lastError; lastError = undefined; }
    states.push(slim);
    enteredInputs.delete(name);
  }
}

// Capture states entered but never exited (failures mid-state)
for (const [name, input] of enteredInputs) {
  states.push({ name, input, error: lastError });
}

// Annotate Choice branches: branch taken = next visited state
for (let i = 0; i < states.length - 1; i++) {
  if (choiceStates.has(states[i].name)) {
    states[i].branchTaken = states[i + 1].name;
    delete states[i].output;
  }
}

const slim = { scenario, status, input: execInput, output: execOutput, states };
process.stdout.write(JSON.stringify(slim, null, 2) + '\n');
