import type { Gate, GateResolution, StackProfile } from './ports.ts';
import type { GateId, GateResult } from './types.ts';
import { redact } from './redact.ts';
import { DomainError } from './errors.ts';

export class UnknownGateError extends DomainError {
  constructor(gateId: string) {
    super('UNKNOWN_GATE', `Gate '${gateId}' is not in the catalog`);
    this.name = 'UnknownGateError';
  }
}

export class NoTestRunnerDeclaredError extends DomainError {
  constructor() {
    super('NO_TEST_RUNNER_DECLARED', 'Test runner is not declared');
    this.name = 'NoTestRunnerDeclaredError';
  }
}

export const GATE_CATALOG: readonly Gate[] = Object.freeze([
  Object.freeze({
    id: 'whitespace' as GateId,
    order: 1,
    intent: 'Detect whitespace/merge marker issues',
  }),
  Object.freeze({ id: 'format' as GateId, order: 2, intent: 'Check code formatting' }),
  Object.freeze({ id: 'lint' as GateId, order: 3, intent: 'Lint source files' }),
  Object.freeze({ id: 'typecheck' as GateId, order: 4, intent: 'Type-check without emitting' }),
  Object.freeze({ id: 'test' as GateId, order: 5, intent: 'Run test suite' }),
  Object.freeze({ id: 'coverage' as GateId, order: 6, intent: 'Measure test coverage' }),
  Object.freeze({ id: 'build' as GateId, order: 7, intent: 'Compile production artifacts' }),
  Object.freeze({
    id: 'audit' as GateId,
    order: 8,
    intent: 'Audit dependencies for vulnerabilities',
  }),
]);

export function getGate(gateId: GateId): Gate {
  const gate = GATE_CATALOG.find((g) => g.id === gateId);
  if (!gate) throw new UnknownGateError(gateId);
  return gate;
}

export function resolveGate(gate: Gate, profile: StackProfile): GateResolution {
  if (!GATE_CATALOG.some((g) => g.id === gate.id)) throw new UnknownGateError(String(gate.id));
  const command = profile.commands[gate.id];
  if (!command) {
    return { status: 'UNAVAILABLE', gate, reason: `No command mapped for gate '${gate.id}'` };
  }
  return { status: 'RESOLVED', gate, command };
}

const MAX_OUTPUT_LENGTH = 2000;

function truncate(text: string): string {
  return text.length > MAX_OUTPUT_LENGTH
    ? text.slice(0, MAX_OUTPUT_LENGTH) + '...[truncated]'
    : text;
}

export interface GateExecutor {
  execute(command: string): { exitCode: number; stdout: string; stderr: string };
}

export function runGate(gate: Gate, profile: StackProfile, executor: GateExecutor): GateResult {
  const resolution = resolveGate(gate, profile);
  if (resolution.status === 'UNAVAILABLE') {
    return {
      gateId: gate.id,
      command: '',
      exitCode: -1,
      durationMs: 0,
      verdict: 'UNAVAILABLE',
      stdout: '',
      stderr: redact(resolution.reason),
      reason: redact(resolution.reason),
    };
  }
  const start = Date.now();
  const output = executor.execute(resolution.command);
  const durationMs = Date.now() - start;
  return {
    gateId: gate.id,
    command: redact(String(resolution.command)),
    exitCode: output.exitCode,
    durationMs,
    verdict: output.exitCode === 0 ? 'PASS' : 'FAIL',
    stdout: truncate(redact(output.stdout)),
    stderr: truncate(redact(output.stderr)),
    reason: '',
  };
}

export class GateRunSession {
  #calls: string[] = [];
  #gateIds: GateId[] = [];
  record(command: string): void {
    this.#calls.push(command);
  }
  recordGate(gateId: GateId): void {
    this.#gateIds.push(gateId);
  }
  get calls(): readonly string[] {
    return Object.freeze([...this.#calls]);
  }
  get gateIds(): readonly GateId[] {
    return Object.freeze([...this.#gateIds]);
  }
  assertOneCallPerGate(): void {
    const unique = new Set(this.#calls);
    if (unique.size !== this.#calls.length) {
      throw new DomainError('GATE_MULTIPLE_CALLS', 'A gate was executed more than once');
    }
  }

  assertInDeclaredOrder(): void {
    const orderById = new Map(GATE_CATALOG.map((g) => [g.id, g.order]));
    let lastOrder = 0;
    for (const gateId of this.#gateIds) {
      const order = orderById.get(gateId);
      if (order === undefined) {
        throw new UnknownGateError(gateId);
      }
      if (order < lastOrder) {
        throw new DomainError(
          'GATE_OUT_OF_ORDER',
          `Gate '${gateId}' executed out of declared order`,
        );
      }
      lastOrder = order;
    }
  }
}

export function evaluateGateRun(results: readonly GateResult[]): {
  allPassed: boolean;
  failures: readonly GateResult[];
} {
  const failures = results.filter((r) => r.verdict !== 'PASS');
  return { allPassed: failures.length === 0, failures: Object.freeze(failures) };
}

export function evaluateTestRunnerDeclaration(runnerDeclared: boolean): void {
  if (!runnerDeclared) throw new NoTestRunnerDeclaredError();
}
