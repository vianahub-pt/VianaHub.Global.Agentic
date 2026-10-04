// GUARD-01 a GUARD-05 — Testes dos guardrails mecanicamente aplicáveis (deny-by-default).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_GIT_COMMANDS,
  FORBIDDEN_GIT_FLAGS,
  FORBIDDEN_GIT_SUBCOMMANDS,
  FORBIDDEN_SHELL_METACHARACTERS,
  GUARDRAIL_PATHS,
  GuardViolationError,
  NETWORK_MODULE_SPECIFIERS,
  SECRET_PATH_PATTERNS,
  assertCanEdit,
  assertNoNetworkImports,
  checkEdit,
  checkExternalInfrastructure,
  checkGitCommand,
  isAllowedGitCommand,
  isGuardrailPath,
  isNetworkSpecifier,
  isSecretPath,
} from '../src/core/guards.ts';
import { REDACTION_PLACEHOLDER } from '../src/core/redact.ts';

function listTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files.sort();
}

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /^\s*import\s+['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined) {
        throw new Error(`Especificador não capturado: ${pattern.source}`);
      }
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

test('GUARD-01: lista de guardrails canônica contém apenas AGENTS.md', () => {
  assert.deepEqual([...GUARDRAIL_PATHS], ['AGENTS.md']);
  assert.equal(isGuardrailPath('AGENTS.md'), true);
  assert.equal(isGuardrailPath('outra/AGENTS.md'), false);
  assert.equal(isGuardrailPath('src/core/guards.ts'), false);
  assert.equal(isGuardrailPath('docs/sprints/sprint-0/spec.md'), false);
});

test('GUARD-01: padrões extras de guardrail podem ser fornecidos pelos adapters', () => {
  const extras = ['opencode.json', '.opencode/**'] as const;
  assert.equal(isGuardrailPath('opencode.json'), false);
  assert.equal(isGuardrailPath('opencode.json', extras), true);
  assert.equal(isGuardrailPath('.opencode/agents/sprint-implementer.md', extras), true);
  assert.equal(isGuardrailPath('.opencode/commands/sprint-loop.md', extras), true);
  assert.equal(isGuardrailPath('.opencode', extras), true);
  assert.equal(isGuardrailPath('AGENTS.md', extras), true);
  assert.equal(isGuardrailPath('src/core/guards.ts', extras), false);
});

test('GUARD-03: padrões de segredo negados e verificados por teste', () => {
  assert.deepEqual(
    [...SECRET_PATH_PATTERNS],
    ['.env*', '*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa', 'id_ed25519'],
  );
  const secrets = [
    '.env',
    '.env.local',
    '.env.production',
    'certs/server.pem',
    'keys/client.key',
    'store/cert.p12',
    'store/cert.pfx',
    'id_rsa',
    '.ssh/id_rsa',
    'id_ed25519',
  ];
  for (const target of secrets) {
    assert.equal(isSecretPath(target), true, `deveria negar '${target}'`);
  }
  const safe = ['src/core/loop.ts', 'test/loop.test.ts', 'README.md', 'package.json', '.gitignore'];
  for (const target of safe) {
    assert.equal(isSecretPath(target), false, `não deveria negar '${target}'`);
  }
});

test('GUARD-02: allow-list explícita do sprint-implementer é honrada', () => {
  const allowed = [
    'src/core/loop.ts',
    'test/loop.test.ts',
    'tests/extra.test.ts',
    'docs/sprints/sprint-0/spec.md',
    'package.json',
    'package-lock.json',
    'README.md',
    'CHANGELOG.md',
  ];
  for (const target of allowed) {
    const decision = checkEdit('sprint-implementer', target);
    assert.equal(decision.allowed, true, `deveria permitir '${target}'`);
  }
});

test('GUARD-02: deny-by-default nega tudo fora da allow-list', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['tsconfig.json', 'DENY_BY_DEFAULT'],
    ['eslint.config.mjs', 'DENY_BY_DEFAULT'],
    ['.prettierignore', 'DENY_BY_DEFAULT'],
    ['', 'DENY_BY_DEFAULT'],
  ];
  for (const [target, code] of cases) {
    const decision = checkEdit('sprint-implementer', target);
    assert.equal(decision.allowed, false);
    if (decision.allowed) {
      assert.fail(`deveria negar '${target}'`);
    }
    assert.equal(decision.code, code);
    assert.ok(decision.reason.length > 0);
  }
});

test('GUARD-02: guardrail canônico AGENTS.md é protegido para todos os papéis', () => {
  const roles = [
    'sprint-orchestrator',
    'sprint-architect',
    'sprint-implementer',
    'sprint-tester',
    'sprint-security',
    'sprint-reviewer',
  ];
  for (const role of roles) {
    const decision = checkEdit(role, 'AGENTS.md');
    assert.equal(decision.allowed, false, `'${role}' não pode editar 'AGENTS.md'`);
    if (decision.allowed) {
      assert.fail('guardrail negado');
    }
    assert.equal(decision.code, 'GUARDRAIL_PROTECTED');
  }
});

test('GUARD-02: padrões extras de guardrail protegem caminhos vendor-specific', () => {
  const extras = ['opencode.json', '.opencode/**'] as const;
  const guardrails = ['opencode.json', '.opencode/agents/x.md', '.opencode/commands/y.md'];
  const roles = [
    'sprint-orchestrator',
    'sprint-architect',
    'sprint-implementer',
    'sprint-tester',
    'sprint-security',
    'sprint-reviewer',
  ];
  for (const role of roles) {
    for (const target of guardrails) {
      const decision = checkEdit(role, target, extras);
      assert.equal(decision.allowed, false, `'${role}' não pode editar '${target}'`);
      if (decision.allowed) {
        assert.fail('guardrail negado');
      }
      assert.equal(decision.code, 'GUARDRAIL_PROTECTED');
    }
  }
});

test('GUARD-02/03: segredos são negados mesmo dentro da allow-list', () => {
  const decision = checkEdit('sprint-implementer', 'src/.env');
  assert.equal(decision.allowed, false);
  if (decision.allowed) {
    assert.fail('segredo deveria ser negado');
  }
  assert.equal(decision.code, 'SECRET_PATH_DENIED');
  assert.equal(checkEdit('sprint-implementer', 'keys/prod.key').allowed, false);
});

test('GUARD-02: papéis somente leitura não editam nada (ROLE-05 mecânico)', () => {
  const readOnlyRoles = ['sprint-architect', 'sprint-tester', 'sprint-security', 'sprint-reviewer'];
  for (const role of readOnlyRoles) {
    for (const target of ['src/core/loop.ts', 'docs/sprints/sprint-0/spec.md', 'package.json']) {
      const decision = checkEdit(role, target);
      assert.equal(decision.allowed, false, `'${role}' não pode editar '${target}'`);
      if (decision.allowed) {
        assert.fail('papel somente leitura editando');
      }
      assert.equal(decision.code, 'ROLE_READ_ONLY');
    }
  }
});

test('GUARD-02: papel desconhecido é negado (fail-closed)', () => {
  for (const role of ['general', 'build', 'explore', 'scout', '', 'ADMIN']) {
    const decision = checkEdit(role, 'src/core/loop.ts');
    assert.equal(decision.allowed, false, `papel '${role}' deveria ser negado`);
    if (decision.allowed) {
      assert.fail('papel desconhecido aceito');
    }
    assert.equal(decision.code, 'UNKNOWN_ROLE');
  }
});

test('GUARD-02: orquestrador edita somente loop-state.md de sprint', () => {
  assert.equal(
    checkEdit('sprint-orchestrator', 'docs/sprints/sprint-0/loop-state.md').allowed,
    true,
  );
  const denied = ['docs/sprints/sprint-0/spec.md', 'src/core/loop.ts', 'package.json'];
  for (const target of denied) {
    const decision = checkEdit('sprint-orchestrator', target);
    assert.equal(decision.allowed, false, `orquestrador não deve editar '${target}'`);
    if (decision.allowed) {
      assert.fail('fora do escopo do orquestrador');
    }
    assert.equal(decision.code, 'DENY_BY_DEFAULT');
  }
});

test('GUARD-02: assertCanEdit lança GuardViolationError tipado na negação', () => {
  assert.doesNotThrow(() => assertCanEdit('sprint-implementer', 'src/core/guards.ts'));
  assert.throws(
    () => assertCanEdit('sprint-reviewer', 'src/core/guards.ts'),
    (error: unknown) => {
      assert.ok(error instanceof GuardViolationError);
      assert.equal(error.guardCode, 'ROLE_READ_ONLY');
      assert.equal(error.target, 'src/core/guards.ts');
      assert.equal(error.code, 'GUARD_VIOLATION');
      return true;
    },
  );
});

test('GUARD-04: allow-list Git cobre somente leitura local', () => {
  assert.deepEqual(
    [...ALLOWED_GIT_COMMANDS],
    [
      'git status',
      'git diff',
      'git log',
      'git show',
      'git ls-files',
      'git rev-parse',
      'git branch',
    ],
  );
  const allowed = [
    'git status',
    'git status --short --branch',
    'git diff --check',
    'git diff --stat',
    'git diff -- src/core/guards.ts',
    'git log --oneline -10',
    'git show HEAD',
    'git show HEAD:src/core/guards.ts',
    'git ls-files --others',
    'git rev-parse HEAD',
    'git rev-parse --show-toplevel',
    'git branch',
    'git branch --show-current',
    'git branch --list feat',
    'git branch --merged main',
    '  git   status  ',
  ];
  for (const command of allowed) {
    const decision = checkGitCommand(command);
    assert.equal(decision.allowed, true, `deveria permitir '${command}'`);
    assert.equal(isAllowedGitCommand(command), true);
  }
});

test('GUARD-04: operações Git remotas/mutáveis são proibidas', () => {
  assert.deepEqual(
    [...FORBIDDEN_GIT_SUBCOMMANDS],
    [
      'push',
      'pull',
      'fetch',
      'clone',
      'remote',
      'commit',
      'merge',
      'rebase',
      'reset',
      'tag',
      'submodule',
    ],
  );
  const forbidden = [
    'git push origin main',
    'git pull',
    'git fetch --all',
    'git clone https://example.com/repo.git',
    'git remote add origin x',
    'git commit -m "msg"',
    'git merge main',
    'git rebase main',
    'git reset --hard',
    'git tag v1.0.0',
    'git submodule update',
  ];
  for (const command of forbidden) {
    const decision = checkGitCommand(command);
    assert.equal(decision.allowed, false, `deveria negar '${command}'`);
    if (decision.allowed) {
      assert.fail('operação Git remota aceita');
    }
    assert.equal(decision.code, 'GIT_REMOTE_FORBIDDEN');
    assert.equal(isAllowedGitCommand(command), false);
  }
});

test('GUARD-04: fora da allow-list Git tudo é negado (fail-closed)', () => {
  const denied = [
    'git checkout -b x',
    'git stash',
    'git reflog',
    'git cat-file -p x',
    'git config --get user.name',
    'git',
  ];
  for (const command of denied) {
    const decision = checkGitCommand(command);
    assert.equal(decision.allowed, false, `deveria negar '${command}'`);
    if (decision.allowed) {
      assert.fail('comando fora da allow-list aceito');
    }
    assert.equal(decision.code, 'GIT_COMMAND_DENIED');
  }
  for (const command of ['', '   ', 'npm test', 'rm -rf /']) {
    assert.equal(isAllowedGitCommand(command), false);
  }
});

test('GUARD-05: módulos de rede declarados e reconhecidos', () => {
  assert.ok(NETWORK_MODULE_SPECIFIERS.includes('node:http'));
  assert.ok(NETWORK_MODULE_SPECIFIERS.includes('node:https'));
  assert.ok(NETWORK_MODULE_SPECIFIERS.includes('node:net'));
  for (const specifier of NETWORK_MODULE_SPECIFIERS) {
    assert.equal(isNetworkSpecifier(specifier), true, `deveria negar '${specifier}'`);
    assert.equal(isNetworkSpecifier(specifier.toUpperCase()), true);
  }
  const safe = ['./types.ts', 'node:fs', 'node:path', 'node:test', 'node:assert/strict'];
  for (const specifier of safe) {
    assert.equal(isNetworkSpecifier(specifier), false, `não deveria negar '${specifier}'`);
  }
});

test('GUARD-05: infraestrutura externa negada (URL, fetch e módulo de rede)', () => {
  const denied = [
    'node:https',
    'https://api.example.com/v1',
    'http://169.254.169.254/latest/meta-data',
    'fetch("https://api.example.com")',
    'new WebSocket("wss://example.com")',
  ];
  for (const reference of denied) {
    const decision = checkExternalInfrastructure(reference);
    assert.equal(decision.allowed, false, `deveria negar '${reference}'`);
    if (decision.allowed) {
      assert.fail('infraestrutura externa aceita');
    }
    assert.equal(decision.code, 'EXTERNAL_INFRASTRUCTURE_DENIED');
  }
  const safe = ['./core/loop.ts', 'node:fs', 'src/core/journal.ts', 'memória local'];
  for (const reference of safe) {
    assert.equal(checkExternalInfrastructure(reference).allowed, true);
  }
  assert.equal(checkExternalInfrastructure('  ').allowed, false);
});

test('GUARD-05: assertNoNetworkImports reprova import de rede detectado', () => {
  assert.doesNotThrow(() => assertNoNetworkImports(['./types.ts', 'node:fs']));
  assert.throws(
    () => assertNoNetworkImports(['./types.ts', 'node:https']),
    (error: unknown) => {
      assert.ok(error instanceof GuardViolationError);
      assert.equal(error.guardCode, 'EXTERNAL_INFRASTRUCTURE_DENIED');
      assert.equal(error.target, 'node:https');
      return true;
    },
  );
});

test('GUARD-05: varredura de imports de rede em src/** e test/** não encontra nada', () => {
  const files = [
    ...listTypeScriptFiles(path.join(process.cwd(), 'src')),
    ...listTypeScriptFiles(path.join(process.cwd(), 'test')),
  ];
  assert.ok(files.length >= 10);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const specifiers = extractSpecifiers(source);
    for (const specifier of specifiers) {
      assert.equal(
        isNetworkSpecifier(specifier),
        false,
        `${file}: import de rede detectado em '${specifier}'`,
      );
    }
    assertNoNetworkImports(specifiers);
  }
});

test('GUARD-02: path traversal é resolvido e negado (BLOCKER)', () => {
  // Os casos exigidos resolvem para o guardrail canônico e são negados pelo caminho resolvido.
  const resolvedGuardrails = ['src/../AGENTS.md', 'docs/../AGENTS.md', 'src\\..\\AGENTS.md'];
  for (const target of resolvedGuardrails) {
    const decision = checkEdit('sprint-implementer', target);
    assert.equal(decision.allowed, false, `deveria negar '${target}'`);
    if (decision.allowed) {
      assert.fail(`path traversal aceito: '${target}'`);
    }
    assert.equal(decision.code, 'GUARDRAIL_PROTECTED', `'${target}' resolve para guardrail`);
    assert.equal(isGuardrailPath(target), true);
  }

  // Com padrões extras de guardrail, traversal que resolve para vendor-specific também é protegido.
  const extras = ['opencode.json', '.opencode/**'] as const;
  const resolvedVendorGuardrails = ['docs/../opencode.json', 'src/core/../../.opencode/x.md'];
  for (const target of resolvedVendorGuardrails) {
    const decision = checkEdit('sprint-implementer', target, extras);
    assert.equal(decision.allowed, false, `deveria negar '${target}'`);
    if (decision.allowed) {
      assert.fail(`path traversal aceito: '${target}'`);
    }
    assert.equal(decision.code, 'GUARDRAIL_PROTECTED', `'${target}' resolve para guardrail`);
    assert.equal(isGuardrailPath(target, extras), true);
  }
  // '..' residual após resolução: escape da raiz negado explicitamente.
  const escapes = [
    '../AGENTS.md',
    'src/../../AGENTS.md',
    'docs/../../../etc/passwd',
    '..\\src\\x.ts',
    'src/core/../../../fora.ts',
  ];
  for (const target of escapes) {
    const decision = checkEdit('sprint-implementer', target);
    assert.equal(decision.allowed, false, `deveria negar '${target}'`);
    if (decision.allowed) {
      assert.fail(`escape aceito: '${target}'`);
    }
    assert.equal(decision.code, 'PATH_DENIED', `'${target}' escapa da raiz`);
  }
  // Caminho absoluto nunca é relativo à raiz do repositório.
  for (const target of ['/AGENTS.md', 'C:\\AGENTS.md', '/etc/passwd']) {
    const decision = checkEdit('sprint-implementer', target);
    assert.equal(decision.allowed, false, `deveria negar '${target}'`);
    if (decision.allowed) {
      assert.fail(`caminho absoluto aceito: '${target}'`);
    }
    assert.equal(decision.code, 'PATH_DENIED');
  }
  // Traversal que resolve dentro da allow-list continua legítimo.
  assert.equal(checkEdit('sprint-implementer', 'src/../test/x.ts').allowed, true);
  assert.equal(checkEdit('sprint-implementer', 'src/core/../core/guards.ts').allowed, true);
});

test('GUARD-02/03: comparação é case-insensitive e ignora aliases de FS', () => {
  assert.equal(isSecretPath('src/.ENV'), true);
  assert.equal(isSecretPath('.ENV'), true);
  assert.equal(isSecretPath('X.KEY'), true);
  assert.equal(isSecretPath('keys/PROD.KEY'), true);
  assert.equal(isGuardrailPath('AGENTS.MD'), true);
  assert.equal(isSecretPath('src/core/loop.ts'), false);
  // Aliases de FS (ponto/espaço final) apontam para o mesmo arquivo em FS case-insensitive.
  assert.equal(isGuardrailPath('AGENTS.md.'), true);
  assert.equal(isGuardrailPath('AGENTS.md '), true);
  for (const target of ['AGENTS.MD', 'src/.ENV', 'AGENTS.md.']) {
    const decision = checkEdit('sprint-implementer', target);
    assert.equal(decision.allowed, false, `deveria negar '${target}'`);
    if (decision.allowed) {
      assert.fail(`alias de guardrail/segredo aceito: '${target}'`);
    }
  }

  // Padrões extras também são case-insensitive e suportam aliases de FS.
  const extras = ['opencode.json', '.opencode/**'] as const;
  assert.equal(isGuardrailPath('Opencode.JSON', extras), true);
  assert.equal(isGuardrailPath('.OPENCODE/AGENTS/X.MD', extras), true);
  for (const target of ['opencode.JSON', '.OPENCODE/AGENTS/X.MD']) {
    const decision = checkEdit('sprint-implementer', target, extras);
    assert.equal(decision.allowed, false, `deveria negar '${target}'`);
    if (decision.allowed) {
      assert.fail(`alias de guardrail aceito: '${target}'`);
    }
  }
});

test('GUARD-04: injeção de shell é negada token a token', () => {
  const injections = [
    'git status && rm -rf /',
    'git status || rm -rf /',
    'git status ; rm',
    'git status | tee x',
    'git status `rm`',
    'git status $(rm)',
    'git status\nrm',
    'git status\rrm',
    'git status > AGENTS.md',
    'git status >> x',
    'git status < x',
    'git status 2> x',
    'git status *',
    'git status ~root',
    "git status 'x'",
    'git status "x"',
    'git status x\\y',
    'git status;git push',
  ];
  for (const command of injections) {
    const decision = checkGitCommand(command);
    assert.equal(decision.allowed, false, `deveria negar '${command}'`);
    if (decision.allowed) {
      assert.fail(`injeção aceita: '${command}'`);
    }
    assert.equal(decision.code, 'GIT_COMMAND_DENIED');
    assert.equal(isAllowedGitCommand(command), false);
  }
  // Cada metacaractere documentado é rejeitado individualmente.
  for (const meta of FORBIDDEN_SHELL_METACHARACTERS) {
    assert.equal(
      checkGitCommand(`git status ${meta} rm`).allowed,
      false,
      `metacaractere '${meta}' aceito`,
    );
    assert.ok(
      FORBIDDEN_SHELL_METACHARACTERS.includes(meta),
      `metacaractere '${meta}' fora da lista documentada`,
    );
  }
  for (const meta of ['&&', '||', ';', '|', '`', '$(', '\n', '\r', '>']) {
    assert.ok(FORBIDDEN_SHELL_METACHARACTERS.includes(meta), `metacaractere '${meta}' não coberto`);
  }
});

test('GUARD-04: flags de escrita e mutação Git são negadas', () => {
  assert.deepEqual(
    [...FORBIDDEN_GIT_FLAGS],
    [
      '--output',
      '--ext-diff',
      '--textconv',
      '--no-index',
      '--delete',
      '--force',
      '--move',
      '--copy',
      '--edit-description',
      '--set-upstream-to',
      '--unset-upstream',
    ],
  );
  const denied = [
    'git diff --output=x',
    'git log --output=x',
    'git diff --ext-diff',
    'git diff --textconv',
    'git diff --output out.txt',
    'git diff --out=x',
    'git diff -o out.txt',
    'git diff -oout.txt',
    'git show --output=x HEAD',
    'git rev-parse --output=x',
    'git branch -D feature',
    'git branch -d feature',
    'git branch --delete feature',
    'git branch --force main',
    'git branch -f main',
    'git branch -m old new',
    'git branch --edit-description main',
    'git branch nova-branch',
  ];
  for (const command of denied) {
    const decision = checkGitCommand(command);
    assert.equal(decision.allowed, false, `deveria negar '${command}'`);
    if (decision.allowed) {
      assert.fail(`flag perigosa aceita: '${command}'`);
    }
    assert.equal(decision.code, 'GIT_COMMAND_DENIED');
    assert.equal(isAllowedGitCommand(command), false);
  }
  // git diff --output=x jamais é classificado como git diff inofensivo.
  assert.equal(isAllowedGitCommand('git diff --output=AGENTS.md'), false);
});

test('GUARD-04: cluster de flags curtas nega qualquer letra proibida do cluster', () => {
  // '-vd' = '-v -d', '-Mm' = '-M -m', '-po' = '-p -o': a letra proibida em qualquer
  // posição do cluster nega o token (o prefixo exato '-d'/'-o' não é mais necessário).
  const denied = [
    'git branch --merged -vd main',
    'git branch --merged -Mm main',
    'git branch --merged -dv main',
    'git diff -po out.txt',
    'git diff -vo out.txt',
    'git diff --stat -ox',
  ];
  for (const command of denied) {
    const decision = checkGitCommand(command);
    assert.equal(decision.allowed, false, `deveria negar '${command}'`);
    if (decision.allowed) {
      assert.fail(`cluster perigoso aceito: '${command}'`);
    }
    assert.equal(decision.code, 'GIT_COMMAND_DENIED');
    assert.equal(isAllowedGitCommand(command), false);
  }
  // Clusters sem letra proibida continuam legítimos.
  const allowed = ['git status -sb', 'git branch --merged -vl main', 'git diff --stat -wv'];
  for (const command of allowed) {
    assert.equal(checkGitCommand(command).allowed, true, `deveria permitir '${command}'`);
  }
});

test('GUARD-04: SEC-10 — --no-index e caminhos absolutos negam leitura arbitrária de arquivos', () => {
  // O vetor exato do finding: '--no-index' + caminho absoluto casava SAFE_GIT_TOKEN.
  const exploit = 'git diff --no-index C:/x NUL';
  const decision = checkGitCommand(exploit);
  assert.equal(decision.allowed, false, 'SEC-10: leitura arbitrária aceita');
  if (decision.allowed) {
    assert.fail('SEC-10: leitura arbitrária aceita');
  }
  assert.equal(decision.code, 'GIT_COMMAND_DENIED');
  assert.equal(isAllowedGitCommand(exploit), false);
  const denied = [
    'git diff --no-index',
    'git diff --no-index src/a.ts src/b.ts',
    'git diff --no-index=1 x y',
    'git diff --no-i x y',
    'git log --no-index x',
    'git diff -- C:/x',
    'git diff -- /etc/passwd',
    'git log --oneline -- C:/Windows/win.ini',
    'git show HEAD:/etc/passwd',
    'git diff -- \\\\host\\share\\x',
    'git rev-parse --verify=C:/x',
    'git diff -- src/../../etc/passwd',
  ];
  for (const command of denied) {
    const result = checkGitCommand(command);
    assert.equal(result.allowed, false, `deveria negar '${command}'`);
    if (result.allowed) {
      assert.fail(`leitura arbitrária aceita: '${command}'`);
    }
    assert.equal(result.code, 'GIT_COMMAND_DENIED');
    assert.equal(isAllowedGitCommand(command), false);
  }
  // O diff interno do repositório continua legítimo.
  const allowed = [
    'git diff -- src/core/guards.ts',
    'git diff --stat',
    'git show HEAD:src/core/guards.ts',
  ];
  for (const command of allowed) {
    assert.equal(checkGitCommand(command).allowed, true, `deveria permitir '${command}'`);
  }
});

test('GUARD-04: SEC-10 — argumentos Git que casam padrão de segredo são negados', () => {
  const denied = [
    'git diff -- .env',
    'git show HEAD:.env',
    'git diff -- id_rsa',
    'git diff -- keys/prod.key',
    'git log -- src/.env.local',
  ];
  for (const command of denied) {
    const decision = checkGitCommand(command);
    assert.equal(decision.allowed, false, `deveria negar '${command}'`);
    if (decision.allowed) {
      assert.fail(`segredo aceito em comando Git: '${command}'`);
    }
    assert.equal(decision.code, 'SECRET_PATH_DENIED');
    assert.equal(isAllowedGitCommand(command), false);
  }
});

test("GUARD-04: SEC-10 — após '--' tokens iniciados por '-' são pathspecs literais", () => {
  // 'git diff -- -x.key' é um arquivo chamado '-x.key': casa '*.key' e é negado, mesmo
  // começando com '-' (após '--' não é flag — é pathspec literal).
  const secret = checkGitCommand('git diff -- -x.key');
  assert.equal(secret.allowed, false, "pathspec literal '-x.key' deveria ser negado");
  if (secret.allowed) {
    assert.fail('segredo aceito como pathspec literal');
  }
  assert.equal(secret.code, 'SECRET_PATH_DENIED');
  // Pathspec literal com traversal residual também passa por isInvalidGitPathArg.
  const traversal = checkGitCommand('git diff -- -x/../..');
  assert.equal(traversal.allowed, false, 'pathspec literal com traversal deveria ser negado');
  if (traversal.allowed) {
    assert.fail('traversal aceito como pathspec literal');
  }
  assert.equal(traversal.code, 'GIT_COMMAND_DENIED');
  // Pathspec literal legítimo com '-' inicial continua aceito.
  for (const command of ['git diff -- -x.ts', 'git diff --stat', 'git diff -- src/-x.ts']) {
    assert.equal(checkGitCommand(command).allowed, true, `deveria permitir '${command}'`);
  }
  assert.equal(isAllowedGitCommand('git diff -- -x.key'), false);
});

test('GUARD-04/05: razões de negação nunca ecoam entrada crua (redação obrigatória)', () => {
  const secret = 'supersecret123';
  // [rótulo, execução, razão ecoa entrada (exige placeholder de redação)]
  const cases: ReadonlyArray<readonly [string, () => unknown, boolean]> = [
    ['git ecoado', () => checkGitCommand(`npm API_KEY=${secret}`), true],
    ['git injetado', () => checkGitCommand(`git status && API_KEY=${secret}`), false],
    [
      'infra URL',
      () => checkExternalInfrastructure(`https://api.example.com/API_KEY=${secret}`),
      true,
    ],
    ['infra fetch', () => checkExternalInfrastructure(`fetch("x API_KEY=${secret}")`), true],
    ['edit', () => checkEdit('sprint-implementer', `API_KEY=${secret}.txt`), true],
    ['edit traversal', () => checkEdit('sprint-implementer', `src/../API_KEY=${secret}.txt`), true],
  ];
  for (const [label, run, echoes] of cases) {
    const decision = run() as ReturnType<typeof checkEdit>;
    assert.equal(decision.allowed, false, `${label}: deveria negar`);
    if (decision.allowed) {
      continue;
    }
    assert.ok(
      !decision.reason.includes(secret),
      `${label}: razão ecoa segredo crua: '${decision.reason}'`,
    );
    if (echoes) {
      assert.ok(
        decision.reason.includes(REDACTION_PLACEHOLDER),
        `${label}: razão sem redação: '${decision.reason}'`,
      );
    }
  }
  // Comandos negados sem eco também nunca vazam a entrada.
  for (const command of [`git checkout API_KEY=${secret}`, `git push API_KEY=${secret}`]) {
    const decision = checkGitCommand(command);
    assert.equal(decision.allowed, false);
    if (decision.allowed) {
      continue;
    }
    assert.ok(!decision.reason.includes(secret));
    assert.ok(!decision.reason.includes(`API_KEY=${secret}`));
  }
  // GuardViolationError redige alvo e mensagem.
  assert.throws(
    () => assertCanEdit('sprint-implementer', `API_KEY=${secret}.txt`),
    (error: unknown) => {
      assert.ok(error instanceof GuardViolationError);
      assert.ok(!error.message.includes(secret));
      assert.ok(!error.target.includes(secret));
      assert.ok(error.message.includes(REDACTION_PLACEHOLDER));
      return true;
    },
  );
});

test('GUARD-05: formas bare de módulos de rede são negadas (deny-by-default)', () => {
  const bare = ['http', 'https', 'http2', 'net', 'tls', 'dns', 'dgram', 'inspector'];
  for (const name of bare) {
    assert.equal(isNetworkSpecifier(name), true, `deveria negar '${name}'`);
    assert.equal(isNetworkSpecifier(`node:${name}`), true, `deveria negar 'node:${name}'`);
    assert.equal(isNetworkSpecifier(`${name.toUpperCase()}`), true);
    assert.equal(checkExternalInfrastructure(name).allowed, false);
  }
  // O specifier bare 'https' (como no import de https) é módulo de rede.
  assert.equal(isNetworkSpecifier('https'), true);
  assert.throws(
    () => assertNoNetworkImports(['https']),
    (error: unknown) => {
      assert.ok(error instanceof GuardViolationError);
      assert.equal(error.guardCode, 'EXTERNAL_INFRASTRUCTURE_DENIED');
      assert.equal(error.target, 'https');
      return true;
    },
  );
  // Subcaminhos seguem o nome base; módulos locais/não-rede continuam permitidos.
  assert.equal(isNetworkSpecifier('dns/promises'), true);
  assert.equal(isNetworkSpecifier('node:dns/promises'), true);
  assert.equal(isNetworkSpecifier('node-fetch'), true);
  const safe = [
    'fs',
    'node:fs',
    'fs/promises',
    'node:fs/promises',
    'node:path',
    'node:test',
    'assert/strict',
    'node:assert/strict',
    './types.ts',
    'src/core/journal.ts',
  ];
  for (const specifier of safe) {
    assert.equal(isNetworkSpecifier(specifier), false, `não deveria negar '${specifier}'`);
    assert.equal(checkExternalInfrastructure(specifier).allowed, true);
  }
});
