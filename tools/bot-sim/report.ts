/**
 * 결과 표 렌더러 — 터미널에 고정폭 표를 그린다.
 *
 * 한글 라벨이 섞이므로 `String.length`로 정렬하면 표가 어긋난다. 동아시아 전각 문자를
 * 폭 2로 세는 `displayWidth`를 쓴다(새 의존성 0개 규칙 때문에 wcwidth 패키지를 못 쓴다).
 */

/** 전각으로 취급할 유니코드 구간 — 한글·한중일 통합한자·전각기호. */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
];

/** 문자열의 터미널 표시 폭. 전각 문자는 2칸으로 센다. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += WIDE_RANGES.some(([lo, hi]) => code >= lo && code <= hi) ? 2 : 1;
  }
  return width;
}

/** 표시 폭 기준 좌측 정렬 패딩. */
function padEndWide(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

/** 표시 폭 기준 우측 정렬 패딩. */
function padStartWide(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - displayWidth(text))) + text;
}

export interface Column {
  readonly header: string;
  /** `true`면 우측 정렬(숫자 열). */
  readonly numeric?: boolean;
}

/**
 * 헤더 + 행 배열을 표 문자열로 만든다.
 * 각 열 폭은 헤더와 모든 셀의 최대 표시 폭으로 자동 결정된다.
 */
export function renderTable(columns: readonly Column[], rows: readonly (readonly string[])[]): string {
  const widths = columns.map((column, index) => {
    const cellWidths = rows.map((row) => displayWidth(row[index] ?? ''));
    return Math.max(displayWidth(column.header), ...cellWidths, 0);
  });

  const format = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => {
        const width = widths[index] ?? 0;
        return columns[index]?.numeric === true ? padStartWide(cell, width) : padEndWide(cell, width);
      })
      .join('  ');

  const separator = widths.map((width) => '─'.repeat(width)).join('  ');
  const lines = [format(columns.map((column) => column.header)), separator, ...rows.map(format)];
  return lines.join('\n');
}

/** 비율을 `12.3%` 형태로. */
export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** 부호를 항상 붙인 비율 — ρ처럼 음수가 의미를 갖는 값에 쓴다. */
export function signedPct(value: number, digits = 1): string {
  const rendered = (value * 100).toFixed(digits);
  return `${value >= 0 ? '+' : ''}${rendered}%`;
}

/** 소수 고정. */
export function num(value: number, digits = 2): string {
  return value.toFixed(digits);
}
