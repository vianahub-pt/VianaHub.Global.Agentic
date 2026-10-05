import type { NonEmptyString, StackProfile } from '../core/ports.ts';
import type { GateId } from '../core/types.ts';

function cmd(s: string): NonEmptyString {
  return s as NonEmptyString;
}

export const nodeTypescriptProfile: StackProfile = Object.freeze({
  validGateIds: Object.freeze([
    'whitespace',
    'format',
    'lint',
    'typecheck',
    'test',
    'coverage',
    'build',
    'audit',
  ] as readonly GateId[]),
  commands: Object.freeze({
    whitespace: cmd('git diff --check'),
    format: cmd('npm run format:check'),
    lint: cmd('npm run lint'),
    typecheck: cmd('npm run typecheck'),
    test: cmd('npm test'),
    coverage: cmd('npm run test:coverage'),
    build: cmd('npm run build'),
    audit: cmd('npm run audit'),
  }),
});
