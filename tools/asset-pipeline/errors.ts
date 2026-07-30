/**
 * 파이프라인이 던지는 모든 예외의 기반 클래스.
 * CLI가 이 타입을 잡아서 사용자용 메시지로 출력하고 non-zero exit 합니다.
 */
export class AssetPipelineError extends Error {
  readonly detail: string | undefined;

  constructor(message: string, detail?: string, options?: { cause?: unknown }) {
    super(detail === undefined ? message : `${message}\n  ↳ ${detail}`, options);
    this.name = 'AssetPipelineError';
    this.detail = detail;
  }
}

/** 산출물에 마젠타가 남아 검사에 실패했을 때. */
export class MagentaResidueError extends AssetPipelineError {
  constructor(message: string, detail?: string) {
    super(message, detail);
    this.name = 'MagentaResidueError';
  }
}
