// CORE-05 / CORE-12 — Erros de domínio tipados e fail-closed do Core.
// O módulo apenas define e exporta os erros: nenhum catch engole falhas aqui.

export class DomainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidTransitionError extends DomainError {
  public readonly from: string;
  public readonly to: string;

  constructor(from: string, to: string) {
    super(
      'INVALID_TRANSITION',
      `Transição de estado inválida: '${from}' -> '${to}'. ` +
        'Apenas transições declaradas no fluxo do loop são permitidas (fail-closed).',
    );
    this.from = from;
    this.to = to;
  }
}

export class UnknownStateError extends DomainError {
  public readonly state: string;

  constructor(state: string) {
    super(
      'UNKNOWN_STATE',
      `Estado desconhecido: '${state}'. Estado não reconhecido (fail-closed).`,
    );
    this.state = state;
  }
}

export class CriterionEvidenceError extends DomainError {
  public readonly criterionId: string;
  public readonly state: string;

  constructor(criterionId: string, state: string) {
    super(
      'CRITERION_EVIDENCE_MISSING',
      `Evidência ausente para o critério '${criterionId}' no estado terminal '${state}'. ` +
        'Evidência é obrigatória para estados terminais (fail-closed).',
    );
    this.criterionId = criterionId;
    this.state = state;
  }
}
