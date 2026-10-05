import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryMonitorSink, FileMonitorSink } from '../src/monitor/sinks.ts';
import { createMonitorEvent } from '../src/monitor/events.ts';

const corr = {
  sprintId: 'sprint-0',
  cycle: 1,
  iteration: 1,
  phase: 'PLANNING',
  role: 'sprint-orchestrator',
  branch: 'main',
  shaBase: 'abc123',
};

test('MON-05: sink memória', () => {
  const sink = new MemoryMonitorSink();
  sink.emit(createMonitorEvent('sprint_started', corr));
  assert.equal(sink.events.length, 1);
  sink.clear();
  assert.equal(sink.events.length, 0);
});

test('MON-05: sink arquivo', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'monitor-test-'));
  try {
    const sink = new FileMonitorSink(join(dir, 'events.jsonl'), dir);
    sink.emit(createMonitorEvent('sprint_started', corr));
    assert.ok(true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('MON-06: path traversal negado', () => {
  const dir = join(tmpdir(), 'monitor-test');
  assert.throws(
    () => new FileMonitorSink('../outside.jsonl', dir),
    (err: unknown) => (err as { code?: string }).code === 'MONITOR_PATH_DENIED',
  );
  assert.throws(
    () => new FileMonitorSink('/absolute/path.jsonl', dir),
    (err: unknown) => (err as { code?: string }).code === 'MONITOR_PATH_DENIED',
  );
});

test('MON-07: symlink que escapa do workspace é negado (fail-closed)', () => {
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'monitor-symlink-'));
  try {
    const workspace = join(tmp, 'workspace');
    const outside = join(tmp, 'outside');
    fs.mkdirSync(workspace);
    fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, 'secret.jsonl'), 'leak', 'utf8');

    // Symlink de diretório para fora da raiz: léxico dentro, físico fora.
    const dirLinkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(outside, join(workspace, 'escape'), dirLinkType);
    assert.throws(
      () => new FileMonitorSink(join('escape', 'events.jsonl'), workspace),
      (err: unknown) => (err as { code?: string }).code === 'MONITOR_PATH_DENIED',
      'symlink de diretório para fora do workspace deveria ser negado',
    );

    // Symlink de arquivo pendente (dangling) apontando para fora da raiz.
    try {
      fs.symlinkSync(join(outside, 'inexistente.jsonl'), join(workspace, 'dangling.jsonl'), 'file');
    } catch {
      // Windows sem privilégios pode não criar symlink de arquivo; o teste do diretório já cobre.
    }
    if (fs.existsSync(join(workspace, 'dangling.jsonl'))) {
      assert.throws(
        () => new FileMonitorSink('dangling.jsonl', workspace),
        (err: unknown) => (err as { code?: string }).code === 'MONITOR_PATH_DENIED',
        'symlink de arquivo pendente para fora do workspace deveria ser negado',
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
