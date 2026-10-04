// LOOP-08, GUARD-03 — Testes de redação de segredos (base de MON-04/LOOP-08).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redact,
  redactObject,
  REDACTION_PLACEHOLDER,
  REDACTION_PATTERN_NAMES,
} from '../src/core/redact.ts';
import { DomainError } from '../src/core/errors.ts';

const CLEAN_SAMPLES: readonly string[] = [
  'O loop de sprint avança para o próximo ciclo.',
  'const total = 42;',
  'Capítulo 3: revisão de arquitetura vendor-neutral',
  'shaBase: 10f90995c9052786e1c63ae5fb44e7c347c3eb01',
  'iteration: 1',
  '',
];

test('redact: catálogo de padrões cobre PEM, autorização, atribuições, URL e tokens', () => {
  assert.deepEqual(
    [...REDACTION_PATTERN_NAMES],
    [
      'PEM_BLOCK',
      'AUTHORIZATION_HEADER',
      'ASSIGNED_SECRET',
      'ASSIGNED_CONNECTION',
      'URL_CREDENTIALS',
      'KNOWN_TOKEN_PREFIX',
    ],
  );
  assert.equal(REDACTION_PLACEHOLDER, '[REDACTED]');
});

test('redact: chaves de API com prefixos conhecidos são redigidas', () => {
  const secretKey = `sk-${'abc123def456'}`;
  const secretToken = `ghp_${'a1b2c3d4e5f6g7h8i9j0'}`;
  const result = redact(`a chave ${secretKey} e o token ${secretToken} vazaram`);
  assert.ok(!result.includes(secretKey));
  assert.ok(!result.includes(secretToken));
  assert.ok(result.includes(REDACTION_PLACEHOLDER));
  assert.ok(result.startsWith('a chave [REDACTED] e o token [REDACTED]'));
});

test('redact: JWT (formato eyJ...) é redigido mesmo sem atribuição', () => {
  const jwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  assert.equal(redact(`payload ${jwt}`), `payload ${REDACTION_PLACEHOLDER}`);
});

test('redact: senhas e tokens atribuídos (chave=valor) são redigidos preservando a chave', () => {
  assert.equal(redact('API_KEY=abc123secret'), `API_KEY=${REDACTION_PLACEHOLDER}`);
  assert.equal(redact('PASSWORD=hunter2'), `PASSWORD=${REDACTION_PLACEHOLDER}`);
  assert.equal(redact('AUTH_TOKEN: xyz789'), `AUTH_TOKEN: ${REDACTION_PLACEHOLDER}`);
  assert.equal(redact('client_secret = "s3gr3d0"'), `client_secret = ${REDACTION_PLACEHOLDER}`);
});

test('redact: atribuições em JSON (chave entre aspas) são redigidas', () => {
  assert.equal(redact('{"password":"hunter2"}'), `{"password":${REDACTION_PLACEHOLDER}}`);
  assert.equal(
    redact('{"user":"admin","token":"abc123"}'),
    `{"user":"admin","token":${REDACTION_PLACEHOLDER}}`,
  );
  assert.equal(redact("{'client_secret':'s3gr3d0'}"), `{'client_secret':${REDACTION_PLACEHOLDER}}`);
});

test('redact: valores de .env (conexão/URL) são redigidos', () => {
  assert.equal(
    redact('DATABASE_URL=postgres://admin:s3nh4@db.local:5432/app'),
    `DATABASE_URL=${REDACTION_PLACEHOLDER}`,
  );
  assert.equal(redact('REDIS_URL=redis://cache:6379'), `REDIS_URL=${REDACTION_PLACEHOLDER}`);
  assert.equal(
    redact('MONGODB_URI=mongodb://root:pw@mongo/db'),
    `MONGODB_URI=${REDACTION_PLACEHOLDER}`,
  );
});

test('redact: blocos PEM são redigidos por inteiro', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0\n-----END RSA PRIVATE KEY-----';
  const result = redact(`arquivo: ${pem}`);
  assert.ok(result.includes(REDACTION_PLACEHOLDER));
  assert.ok(!result.includes('MIIEpAIBAAKCAQEA0'));
  assert.ok(!result.includes('BEGIN RSA PRIVATE KEY'));
});

test('redact: Authorization Bearer é redigido preservando o esquema', () => {
  assert.equal(
    redact('Authorization: Bearer abcdef1234567890'),
    `Authorization: Bearer ${REDACTION_PLACEHOLDER}`,
  );
  assert.equal(
    redact('authorization: basic dXNlcjpwYXNz'),
    `authorization: basic ${REDACTION_PLACEHOLDER}`,
  );
});

test('redact: credenciais em URLs são redigidas mantendo usuário e host', () => {
  const result = redact('conectar em postgres://admin:s3nh4@banco-interno:5432/app');
  assert.ok(result.includes('postgres://admin:[REDACTED]@'));
  assert.ok(!result.includes('s3nh4'));
  assert.ok(result.includes('banco-interno'));
});

test('redact: texto limpo permanece inalterado', () => {
  for (const sample of CLEAN_SAMPLES) {
    assert.equal(redact(sample), sample);
  }
});

test('redact: múltiplos segredos no mesmo texto são todos redigidos', () => {
  const text = 'API_KEY=sk1 e PASSWORD=pw1 e token tk1 em Authorization: Bearer zz1';
  const result = redact(text);
  assert.ok(!result.includes('sk1'));
  assert.ok(!result.includes('pw1'));
  assert.ok(!result.includes('zz1'));
  assert.ok(result.includes(`API_KEY=${REDACTION_PLACEHOLDER}`));
  assert.ok(result.includes(`PASSWORD=${REDACTION_PLACEHOLDER}`));
  assert.ok(result.includes(`Bearer ${REDACTION_PLACEHOLDER}`));
});

test('redact: entrada que não é texto lança DomainError fail-closed', () => {
  assert.throws(
    () => redact(42 as unknown as string),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, 'REDACT_INPUT_INVALID');
      return true;
    },
  );
});

test('redactObject: objeto aninhado é redigido recursivamente', () => {
  const input = {
    action: 'deploy',
    secret: 'API_KEY=sk-live-abc12345',
    nota: 'API_KEY=sk-live-abc12345',
    nested: {
      token: 'TOKEN=abc123',
      deep: { password: 'password=xyz789', keep: 'visível' },
    },
    list: ['password=um', 'dois'],
    count: 3,
    flag: true,
    nothing: null,
  };
  const output = redactObject(input) as Record<string, unknown>;
  const nested = output['nested'] as Record<string, unknown>;
  const deep = nested['deep'] as Record<string, unknown>;
  assert.equal(output['action'], 'deploy');
  // Nome de chave sensível + valor string redige por inteiro (fail-closed).
  assert.equal(output['secret'], REDACTION_PLACEHOLDER);
  assert.equal(nested['token'], REDACTION_PLACEHOLDER);
  assert.equal(deep['password'], REDACTION_PLACEHOLDER);
  // Chave não sensível segue o caminho de padrões do texto.
  assert.equal(output['nota'], `API_KEY=${REDACTION_PLACEHOLDER}`);
  assert.equal(deep['keep'], 'visível');
  assert.deepEqual(output['list'], [`password=${REDACTION_PLACEHOLDER}`, 'dois']);
  assert.equal(output['count'], 3);
  assert.equal(output['flag'], true);
  assert.equal(output['nothing'], null);
});

test('redactObject: nome de chave sensível redige valor string mesmo sem padrão', () => {
  const output = redactObject({ token: 'abc123', password: 'hunter2', user: 'admin' }) as Record<
    string,
    unknown
  >;
  assert.equal(output['token'], REDACTION_PLACEHOLDER);
  assert.equal(output['password'], REDACTION_PLACEHOLDER);
  assert.equal(output['user'], 'admin');
  assert.ok(!JSON.stringify(output).includes('abc123'));
  assert.ok(!JSON.stringify(output).includes('hunter2'));
});

test('redactObject: não altera o objeto original', () => {
  const input = { secret: 'API_KEY=sk-live-abc12345', nested: { token: 'TOKEN=abc123' } };
  redactObject(input);
  assert.equal(input.secret, 'API_KEY=sk-live-abc12345');
  assert.equal(input.nested.token, 'TOKEN=abc123');
});

test('redactObject: tipos não-plain (Date) são preservados sem introspecção', () => {
  const instant = new Date('2026-10-01T00:00:00.000Z');
  const output = redactObject({ instant }) as Record<string, unknown>;
  assert.equal(output['instant'], instant);
});

test('redactObject: Map e Set são reconstruídos com redação recursiva', () => {
  const input = {
    mapa: new Map<string, string>([
      ['chave', 'API_KEY=supersecret123'],
      ['limpa', 'visível'],
    ]),
    conjunto: new Set(['password=supersecret456', 'texto comum']),
  };
  const output = redactObject(input) as {
    mapa: Map<string, unknown>;
    conjunto: Set<unknown>;
  };
  assert.ok(output.mapa instanceof Map);
  assert.equal(output.mapa.get('chave'), `API_KEY=${REDACTION_PLACEHOLDER}`);
  assert.equal(output.mapa.get('limpa'), 'visível');
  assert.ok(output.conjunto instanceof Set);
  const values = [...output.conjunto];
  assert.ok(values.includes(`password=${REDACTION_PLACEHOLDER}`));
  assert.ok(values.includes('texto comum'));
  const nested = redactObject(new Map([['x', { token: 'TOKEN=abc123' }]])) as Map<string, unknown>;
  const nestedValue = nested.get('x') as Record<string, unknown>;
  assert.equal(nestedValue['token'], REDACTION_PLACEHOLDER);
  const leaked = JSON.stringify([
    [...output.mapa.values()],
    [...output.conjunto],
    [...nested.values()],
  ]);
  assert.ok(!leaked.includes('supersecret123'));
  assert.ok(!leaked.includes('supersecret456'));
  assert.ok(!leaked.includes('abc123'));
});

test('redactObject: Error é serializado com name, message e stack redigidos', () => {
  const error = new Error('falha com API_KEY=supersecret123');
  error.stack = 'Error: falha com API_KEY=supersecret123\n    at operacao';
  const output = redactObject({ error }) as Record<string, unknown>;
  const redactedError = output['error'] as Record<string, unknown>;
  assert.equal(redactedError['name'], 'Error');
  assert.equal(redactedError['message'], `falha com API_KEY=${REDACTION_PLACEHOLDER}`);
  assert.ok(String(redactedError['stack']).includes(REDACTION_PLACEHOLDER));
  assert.ok(!JSON.stringify(output).includes('supersecret123'));
});

test('redactObject: Buffer e typed arrays nunca saem sem redação', () => {
  const input = {
    buffer: Buffer.from('API_KEY=supersecret123', 'utf8'),
    view: new Uint8Array([1, 2, 3]),
    raw: new ArrayBuffer(4),
  };
  const output = redactObject(input) as Record<string, unknown>;
  assert.equal(output['buffer'], REDACTION_PLACEHOLDER);
  assert.equal(output['view'], REDACTION_PLACEHOLDER);
  assert.equal(output['raw'], REDACTION_PLACEHOLDER);
  assert.ok(!JSON.stringify(output).includes('supersecret123'));
});

test('redactObject: instância de classe é serializada em plain object redigido', () => {
  class Config {
    apiKey = 'API_KEY=supersecret123';
    label = 'produção';
  }
  const output = redactObject({ config: new Config() }) as Record<string, unknown>;
  const config = output['config'] as Record<string, unknown>;
  // 'apiKey' é nome de chave sensível: valor string vira placeholder (fail-closed).
  assert.equal(config['apiKey'], REDACTION_PLACEHOLDER);
  assert.equal(config['label'], 'produção');
  assert.ok(!JSON.stringify(output).includes('supersecret123'));
});

test('redactObject: referência circular vira placeholder sem loop infinito', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  const output = redactObject(cyclic) as Record<string, unknown>;
  assert.equal(output['self'], REDACTION_PLACEHOLDER);
});

test('redactObject: objeto vazio e texto limpo seguem intactos', () => {
  assert.deepEqual(redactObject({}), {});
  assert.deepEqual(redactObject([]), []);
  assert.equal(redactObject('texto comum'), 'texto comum');
  assert.equal(redactObject(7), 7);
  assert.equal(redactObject(null), null);
});
