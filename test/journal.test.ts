// LOOP-08, CORE-09 — Testes do journal append-only, imutável e redigido.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FileJournalSink,
  InvalidJournalEntryError,
  JOURNAL_SCHEMA_VERSION,
  JournalParseError,
  MemoryJournalSink,
  assertValidJournalEntry,
  isJournalEntry,
  prepareJournalEntry,
} from '../src/core/journal.ts';
import type { JournalEntry } from '../src/core/types.ts';
import { REDACTION_PLACEHOLDER } from '../src/core/redact.ts';
import { DomainError } from '../src/core/errors.ts';
import type { JournalSink } from '../src/core/ports.ts';

function buildEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    sprint: 'sprint-0',
    cycle: 2,
    iteration: 1,
    phase: 'IMPLEMENTING',
    role: 'sprint-implementer',
    action: 'criar modulo',
    result: 'ok',
    timestamp: '2026-10-01T12:00:00.000Z',
    branch: 'feature/sprint-0-bootstrap-agentic-framework',
    shaBase: '10f90995c9052786e1c63ae5fb44e7c347c3eb01',
    ...overrides,
  };
}

function withTempDir(run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-test-'));
  try {
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('LOOP-08: JOURNAL_SCHEMA_VERSION é declarado e exigido nas entradas', () => {
  assert.equal(JOURNAL_SCHEMA_VERSION, '1');
  assert.equal(buildEntry().schemaVersion, JOURNAL_SCHEMA_VERSION);
});

test('LOOP-08: MemoryJournalSink faz round-trip da entrada tipada', () => {
  const sink = new MemoryJournalSink();
  const entry = buildEntry();
  sink.append(entry);
  const all = sink.readAll();
  assert.equal(all.length, 1);
  assert.deepEqual(all[0], entry);
});

test('LOOP-08: append-only acumula entradas sem substituir nem remover', () => {
  const sink = new MemoryJournalSink();
  sink.append(buildEntry({ action: 'primeira' }));
  sink.append(buildEntry({ action: 'segunda' }));
  sink.append(buildEntry({ action: 'terceira' }));
  const all = sink.readAll();
  assert.equal(all.length, 3);
  assert.equal(all[0]?.action, 'primeira');
  assert.equal(all[1]?.action, 'segunda');
  assert.equal(all[2]?.action, 'terceira');
});

test('LOOP-08: entrada gravada é imutável (congelada) após o append', () => {
  const sink = new MemoryJournalSink();
  sink.append(buildEntry({ result: 'original' }));
  const stored = sink.readAll()[0];
  assert.ok(stored !== undefined);
  assert.ok(Object.isFrozen(stored));
  assert.throws(() => {
    (stored as { result: string }).result = 'mudado';
  }, TypeError);
  assert.equal(sink.readAll()[0]?.result, 'original');
});

test('LOOP-08: mutação do objeto original após append não afeta o journal', () => {
  const sink = new MemoryJournalSink();
  const entry = buildEntry({ action: 'ação original' });
  sink.append(entry);
  (entry as { action: string }).action = 'ação adulterada';
  assert.equal(sink.readAll()[0]?.action, 'ação original');
});

test('LOOP-08: readAll devolve lista congelada (sem push/atribuição)', () => {
  const sink = new MemoryJournalSink();
  sink.append(buildEntry());
  const all = sink.readAll();
  assert.ok(Object.isFrozen(all));
  assert.throws(() => {
    (all as JournalEntry[]).push(buildEntry());
  }, TypeError);
});

test('LOOP-08: redação é obrigatória antes de persistir (memória)', () => {
  const sink = new MemoryJournalSink();
  sink.append(
    buildEntry({ action: 'usar API_KEY=sk-live-1234567890', result: 'password=abc123 confirmado' }),
  );
  const stored = sink.readAll()[0];
  assert.ok(stored !== undefined);
  assert.ok(stored.action.includes(REDACTION_PLACEHOLDER));
  assert.ok(!stored.action.includes('sk-live-1234567890'));
  assert.ok(stored.result.includes(REDACTION_PLACEHOLDER));
  assert.ok(!stored.result.includes('abc123'));
});

test('LOOP-08: prepareJournalEntry valida, redige e congela', () => {
  const prepared = prepareJournalEntry(buildEntry({ action: 'TOKEN=ghp_abcdefghijklmnopqrst' }));
  assert.ok(Object.isFrozen(prepared));
  assert.equal(prepared.action, `TOKEN=${REDACTION_PLACEHOLDER}`);
  assert.ok(isJournalEntry(prepared));
  assert.deepEqual(assertValidJournalEntry(prepared), prepared);
});

test('LOOP-08: FileJournalSink faz round-trip append + readAll', () => {
  withTempDir((dir) => {
    const filePath = path.join(dir, 'journal.jsonl');
    const sink: JournalSink = new FileJournalSink(filePath, dir);
    const first = buildEntry({ action: 'primeira' });
    const second = buildEntry({ action: 'segunda', cycle: 3 });
    sink.append(first);
    sink.append(second);
    const all = sink.readAll();
    assert.equal(all.length, 2);
    assert.deepEqual(all[0], prepareJournalEntry(first));
    assert.deepEqual(all[1], prepareJournalEntry(second));
  });
});

test('LOOP-08: FileJournalSink é append-only real (linhas anteriores intactas)', () => {
  withTempDir((dir) => {
    const filePath = path.join(dir, 'journal.jsonl');
    const sink = new FileJournalSink(filePath, dir);
    sink.append(buildEntry({ action: 'primeira' }));
    const afterFirst = fs.readFileSync(filePath, 'utf8');
    sink.append(buildEntry({ action: 'segunda' }));
    const afterSecond = fs.readFileSync(filePath, 'utf8');
    assert.ok(afterSecond.startsWith(afterFirst));
    assert.equal(afterFirst.trim().split('\n').length, 1);
    assert.equal(afterSecond.trim().split('\n').length, 2);
  });
});

test('LOOP-08: FileJournalSink persiste a entrada redigida, nunca o segredo', () => {
  withTempDir((dir) => {
    const filePath = path.join(dir, 'journal.jsonl');
    const sink = new FileJournalSink(filePath, dir);
    sink.append(buildEntry({ action: 'API_KEY=sk-live-99999', result: 'ok' }));
    const raw = fs.readFileSync(filePath, 'utf8');
    assert.ok(!raw.includes('sk-live-99999'));
    assert.ok(raw.includes(REDACTION_PLACEHOLDER));
  });
});

test('LOOP-08: FileJournalSink em arquivo inexistente devolve journal vazio', () => {
  withTempDir((dir) => {
    const sink = new FileJournalSink(path.join(dir, 'ainda-nao-existe.jsonl'), dir);
    assert.deepEqual(sink.readAll(), []);
  });
});

test('LOOP-08: caminho de journal vazio é rejeitado (fail-closed)', () => {
  withTempDir((dir) => {
    assert.throws(
      () => new FileJournalSink('  ', dir),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, 'DomainError');
        return true;
      },
    );
    assert.throws(
      () => new FileJournalSink('journal.jsonl', '   '),
      (error: unknown) => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.code, 'INVALID_JOURNAL_ROOT');
        return true;
      },
    );
  });
});

test('LOOP-08: FileJournalSink nega escape da raiz autorizada (fail-closed)', () => {
  withTempDir((dir) => {
    const escapes = [
      '../fora.jsonl',
      'sub/../../fora.jsonl',
      path.join(dir, '..', 'fora.jsonl'),
      path.resolve(dir, '..', 'fora.jsonl'),
      path.resolve('C:\\', 'fora-da-raiz.jsonl'),
      '.',
      dir,
      'journal\0.jsonl',
    ];
    for (const target of escapes) {
      assert.throws(
        () => new FileJournalSink(target, dir),
        (error: unknown) => {
          assert.ok(error instanceof DomainError);
          assert.equal(error.code, 'JOURNAL_PATH_DENIED', `escape aceito: '${target}'`);
          return true;
        },
        `deveria negar '${target}'`,
      );
    }
    // Caminho relativo com '.' e '..' que resolve DENTRO da raiz continua legítimo.
    const sink = new FileJournalSink('sub/../journal.jsonl', dir);
    sink.append(buildEntry({ action: 'dentro da raiz' }));
    assert.equal(sink.readAll().length, 1);
    assert.ok(fs.existsSync(path.join(dir, 'journal.jsonl')));
  });
});

test('LOOP-08: symlink que escapa da raiz autorizada é negado (fail-closed)', () => {
  withTempDir((dir) => {
    const root = path.join(dir, 'root');
    const outside = path.join(dir, 'outside');
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'segredo.txt'), 'API_KEY=sk-live-1234567890', 'utf8');

    // 'junction' não exige privilégios no Windows; nos demais SOs, symlink de diretório.
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(outside, path.join(root, 'escape'), linkType);

    // Diretório linkado: caminho léxico dentro da raiz, caminho físico fora dela.
    assert.throws(
      () => new FileJournalSink(path.join('escape', 'journal.jsonl'), root),
      (error: unknown) => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.code, 'JOURNAL_PATH_DENIED');
        return true;
      },
      'symlink de diretório para fora da raiz deveria ser negado',
    );

    // Arquivo linkado para fora (existente e pendente): negado quando o SO permite criar.
    const fileLinks: ReadonlyArray<readonly [string, string]> = [
      ['vazamento.jsonl', path.join(outside, 'segredo.txt')],
      ['pendente.jsonl', path.join(outside, 'ainda-nao-existe.jsonl')],
    ];
    for (const [name, target] of fileLinks) {
      try {
        fs.symlinkSync(target, path.join(root, name), 'file');
      } catch {
        continue; // Windows sem privilégios não cria symlink de arquivo.
      }
      assert.throws(
        () => new FileJournalSink(name, root),
        (error: unknown) => {
          assert.ok(error instanceof DomainError);
          assert.equal(error.code, 'JOURNAL_PATH_DENIED');
          return true;
        },
        `symlink de arquivo '${name}' para fora da raiz deveria ser negado`,
      );
    }

    // Symlink que aponta para DENTRO da raiz continua legítimo: a contenção é o critério.
    const inner = path.join(root, 'inner');
    fs.mkdirSync(inner);
    fs.symlinkSync(inner, path.join(root, 'alias'), linkType);
    const sink = new FileJournalSink(path.join('alias', 'journal.jsonl'), root);
    sink.append(buildEntry({ action: 'dentro da raiz via symlink' }));
    assert.equal(sink.readAll().length, 1);
    assert.ok(fs.existsSync(path.join(inner, 'journal.jsonl')));

    // Troca do alvo por symlink após a construção também não escapa (revalidação por acesso).
    const swapped = path.join(root, 'swap.jsonl');
    fs.writeFileSync(swapped, '', 'utf8');
    const swapSink = new FileJournalSink('swap.jsonl', root);
    fs.rmSync(swapped);
    try {
      fs.symlinkSync(path.join(outside, 'segredo.txt'), swapped, 'file');
    } catch {
      return; // Windows sem privilégios não cria symlink de arquivo.
    }
    assert.throws(
      () => swapSink.append(buildEntry({ action: 'troca maliciosa' })),
      (error: unknown) => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.code, 'JOURNAL_PATH_DENIED');
        return true;
      },
      'troca do alvo por symlink após a construção deveria ser negada',
    );
  });
});

test('LOOP-08: entrada inválida lança InvalidJournalEntryError com campo preciso', () => {
  const sink = new MemoryJournalSink();
  const cases: ReadonlyArray<readonly [string, JournalEntry]> = [
    ['schemaVersion', buildEntry({ schemaVersion: '' })],
    ['schemaVersion', buildEntry({ schemaVersion: '2' })],
    ['sprint', buildEntry({ sprint: ' ' })],
    ['cycle', buildEntry({ cycle: 0 })],
    ['iteration', buildEntry({ iteration: -1 })],
    ['phase', buildEntry({ phase: 'NOPE' as never })],
    ['role', buildEntry({ role: 'hacker' as never })],
    ['action', buildEntry({ action: '' })],
    ['result', buildEntry({ result: '   ' })],
    ['timestamp', buildEntry({ timestamp: '' })],
    ['branch', buildEntry({ branch: '' })],
    ['shaBase', buildEntry({ shaBase: ' ' })],
  ];
  for (const [field, entry] of cases) {
    assert.throws(
      () => sink.append(entry),
      (error: unknown) => {
        assert.ok(error instanceof InvalidJournalEntryError);
        assert.equal(error.field, field);
        assert.equal(error.code, 'INVALID_JOURNAL_ENTRY');
        return true;
      },
    );
  }
  assert.throws(
    () => sink.append(null as unknown as JournalEntry),
    (error: unknown) => {
      assert.ok(error instanceof InvalidJournalEntryError);
      assert.equal(error.field, 'entry');
      return true;
    },
  );
  assert.equal(sink.readAll().length, 0);
});

test('LOOP-08: isJournalEntry classifica entradas válidas e inválidas', () => {
  assert.equal(isJournalEntry(buildEntry()), true);
  assert.equal(isJournalEntry(prepareJournalEntry(buildEntry())), true);
  assert.equal(isJournalEntry({}), false);
  assert.equal(isJournalEntry(null), false);
  assert.equal(isJournalEntry('entry'), false);
  assert.equal(isJournalEntry(buildEntry({ cycle: 1.5 })), false);
  assert.equal(isJournalEntry(buildEntry({ phase: 'FASE' as never })), false);
});

test('LOOP-08: linha corrompida no arquivo lança JournalParseError (fail-closed)', () => {
  withTempDir((dir) => {
    const filePath = path.join(dir, 'journal.jsonl');
    const sink = new FileJournalSink(filePath, dir);
    sink.append(buildEntry({ action: 'primeira' }));
    fs.appendFileSync(filePath, 'isto-não-é-json\n', 'utf8');
    assert.throws(
      () => sink.readAll(),
      (error: unknown) => {
        assert.ok(error instanceof JournalParseError);
        assert.equal(error.line, 2);
        assert.equal(error.code, 'JOURNAL_PARSE_ERROR');
        return true;
      },
    );
  });
});

test('LOOP-08: linha JSON com estrutura inválida também falha fechado', () => {
  withTempDir((dir) => {
    const filePath = path.join(dir, 'journal.jsonl');
    fs.writeFileSync(filePath, '{"schemaVersion":"1"}\n', 'utf8');
    const sink = new FileJournalSink(filePath, dir);
    assert.throws(
      () => sink.readAll(),
      (error: unknown) => {
        assert.ok(error instanceof InvalidJournalEntryError);
        return true;
      },
    );
  });
});
