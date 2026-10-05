import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_CATALOG,
  getGate,
  resolveGate,
  runGate,
  evaluateGateRun,
  evaluateTestRunnerDeclaration,
  GateRunSession,
  UnknownGateError,
  NoTestRunnerDeclaredError,
} from '../src/core/gates.ts';
import { DomainError } from '../src/core/errors.ts';
import { nodeTypescriptProfile } from '../src/profile/node-typescript.profile.ts';
import type { Gate, StackProfile } from '../src/core/ports.ts';
import type { GateId } from '../src/core/types.ts';

function profileWith(commands: Record<string, string>): StackProfile {
  return { commands } as unknown as StackProfile;
}

function executorReturning(exitCode: number, stdout = '', stderr = '') {
  return {
    execute: (): { exitCode: number; stdout: string; stderr: string } => ({
      exitCode,
      stdout,
      stderr,
    }),
  };
}

describe('GATE-01: catalog structure', () => {
  it('contains exactly 8 gates', () => {
    assert.equal(GATE_CATALOG.length, 8);
  });

  it('has stable IDs in canonical order', () => {
    assert.deepEqual(
      GATE_CATALOG.map((g) => g.id),
      ['whitespace', 'format', 'lint', 'typecheck', 'test', 'coverage', 'build', 'audit'],
    );
  });

  it('has order values from 1 to 8', () => {
    assert.deepEqual(
      GATE_CATALOG.map((g) => g.order),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
  });
});

describe('GATE-02: intent separated from command', () => {
  it('every gate declares a non-empty intent', () => {
    for (const gate of GATE_CATALOG) {
      assert.ok(gate.intent.length > 0, `Gate '${String(gate.id)}' must declare an intent`);
    }
  });

  it('gates do not carry a command field', () => {
    for (const gate of GATE_CATALOG) {
      assert.ok(!('command' in gate), `Gate '${String(gate.id)}' must not have a command field`);
    }
  });
});

describe('GATE-03: runGate produces GateResult', () => {
  it('returns command, exitCode, durationMs and verdict for a passing gate', () => {
    const gate = getGate('whitespace' as GateId);
    const result = runGate(
      gate,
      profileWith({ whitespace: 'git diff --check' }),
      executorReturning(0, 'clean', ''),
    );

    assert.equal(result.gateId, 'whitespace');
    assert.equal(result.command, 'git diff --check');
    assert.equal(result.exitCode, 0);
    assert.ok(result.durationMs >= 0);
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.stdout, 'clean');
  });

  it('returns FAIL verdict for non-zero exit code', () => {
    const gate = getGate('lint' as GateId);
    const result = runGate(
      gate,
      profileWith({ lint: 'npm run lint' }),
      executorReturning(2, '', 'lint errors'),
    );

    assert.equal(result.verdict, 'FAIL');
    assert.equal(result.exitCode, 2);
    assert.equal(result.stderr, 'lint errors');
  });
});

describe('GATE-04: getGate rejects unknown IDs', () => {
  it('throws UnknownGateError for a nonexistent gate', () => {
    assert.throws(
      () => getGate('nonexistent' as unknown as GateId),
      (err: unknown) => {
        assert.ok(err instanceof UnknownGateError);
        assert.equal(err.name, 'UnknownGateError');
        return true;
      },
    );
  });
});

test('GATE-04: gate forjado é rejeitado', () => {
  const fake: Gate = { id: 'fake' as unknown as GateId, order: 99, intent: 'x' };
  assert.throws(
    () => resolveGate(fake, nodeTypescriptProfile),
    (e: unknown) => {
      assert.ok(e instanceof UnknownGateError);
      assert.equal(e.code, 'UNKNOWN_GATE');
      return true;
    },
  );
});

describe('GATE-05: unmapped gate is UNAVAILABLE (never skip)', () => {
  it('runGate returns UNAVAILABLE when no command is mapped', () => {
    const result = runGate(getGate('audit' as GateId), profileWith({}), executorReturning(0));

    assert.equal(result.verdict, 'UNAVAILABLE');
    assert.equal(result.exitCode, -1);
    assert.equal(result.command, '');
  });

  it('resolveGate reports UNAVAILABLE status', () => {
    const resolution = resolveGate(getGate('build' as GateId), profileWith({}));
    assert.equal(resolution.status, 'UNAVAILABLE');
  });
});

describe('GATE-06: evaluateTestRunnerDeclaration', () => {
  it('throws NoTestRunnerDeclaredError when no runner is declared', () => {
    assert.throws(
      () => evaluateTestRunnerDeclaration(false),
      (err: unknown) => {
        assert.ok(err instanceof NoTestRunnerDeclaredError);
        assert.equal(err.name, 'NoTestRunnerDeclaredError');
        return true;
      },
    );
  });

  it('does not throw when a runner is declared', () => {
    assert.doesNotThrow(() => evaluateTestRunnerDeclaration(true));
  });
});

describe('GATE-07: session tracking and run evaluation', () => {
  it('GateRunSession records commands and returns immutable snapshot', () => {
    const session = new GateRunSession();
    session.record('npm run lint');
    session.record('npm test');
    assert.deepEqual([...session.calls], ['npm run lint', 'npm test']);
  });

  it('assertOneCallPerGate throws on duplicate calls', () => {
    const session = new GateRunSession();
    session.record('npm run lint');
    session.record('npm run lint');
    assert.throws(() => session.assertOneCallPerGate(), /more than once/);
  });

  it('assertOneCallPerGate passes with unique commands', () => {
    const session = new GateRunSession();
    session.record('npm run lint');
    session.record('npm test');
    assert.doesNotThrow(() => session.assertOneCallPerGate());
  });

  it('assertInDeclaredOrder passes when gates follow GATE_CATALOG order', () => {
    const session = new GateRunSession();
    session.recordGate('whitespace');
    session.recordGate('format');
    session.recordGate('lint');
    assert.doesNotThrow(() => session.assertInDeclaredOrder());
  });

  it('assertInDeclaredOrder throws when gates are out of order', () => {
    const session = new GateRunSession();
    session.recordGate('lint');
    session.recordGate('format');
    assert.throws(
      () => session.assertInDeclaredOrder(),
      (err: unknown) => {
        assert.ok(err instanceof DomainError);
        assert.equal((err as DomainError).code, 'GATE_OUT_OF_ORDER');
        return true;
      },
    );
  });

  it('evaluateGateRun reports allPassed and collects failures', () => {
    const pass = {
      gateId: 'lint' as GateId,
      command: 'npm run lint',
      exitCode: 0,
      durationMs: 5,
      verdict: 'PASS' as const,
      stdout: '',
      stderr: '',
      reason: '',
    };
    const fail = {
      gateId: 'test' as GateId,
      command: 'npm test',
      exitCode: 1,
      durationMs: 10,
      verdict: 'FAIL' as const,
      stdout: '',
      stderr: 'broken',
      reason: '',
    };

    const clean = evaluateGateRun([pass]);
    assert.equal(clean.allPassed, true);
    assert.equal(clean.failures.length, 0);

    const dirty = evaluateGateRun([pass, fail]);
    assert.equal(dirty.allPassed, false);
    assert.equal(dirty.failures.length, 1);
    const firstFailure = dirty.failures[0];
    assert.ok(firstFailure);
    assert.equal(firstFailure.gateId, 'test');
  });

  it('evaluateGateRun treats UNAVAILABLE as failure', () => {
    const result = evaluateGateRun([
      {
        gateId: 'audit' as GateId,
        command: '',
        exitCode: -1,
        durationMs: 0,
        verdict: 'UNAVAILABLE' as const,
        stdout: '',
        stderr: 'no command',
        reason: 'no command',
      },
    ]);
    assert.equal(result.allPassed, false);
    assert.equal(result.failures.length, 1);
  });
});
