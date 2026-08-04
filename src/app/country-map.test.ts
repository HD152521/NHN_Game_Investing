import { describe, expect, test } from 'vitest';

/**
 * 전선 선택 지도 — 한반도.
 *
 * 그림은 눈으로 봐야 하지만 **깨지면 안 되는 약속**은 고정할 수 있다:
 * ① 세계지도와 같은 투영 규칙을 쓴다(줌인한 느낌이 유지된다)
 * ② 노드 상태가 카드 잠금과 **같은 판정**에서 나온다(두 화면이 다른 말을 하지 않는다)
 * ③ 브리핑 숫자가 전부 `STAGES`에서 온다(§19-4 이중 출처 금지)
 * ④ R0는 스테이지가 없다는 사실이 드러난다
 */
import { STAGES, WAVE_COUNT } from '../combat';
import {
  COUNTRY_GRID_HEIGHT,
  COUNTRY_GRID_WIDTH,
  DMZ_LATITUDE,
  FRONT_LINKS,
  FRONT_NODES,
  NODE_STATUS_LABEL,
  briefingFor,
  latToCountryCell,
  lonToCountryCell,
  nodeStatusOf,
  peninsulaCells,
} from './country-map';
import { emptyProgress, withCleared } from './progress';
import { isRegionLocked } from './region-select';

describe('투영 — 세계지도와 같은 규칙, 격자만 좁다', () => {
  test('노드가 전부 격자 안에 들어간다', () => {
    for (const node of FRONT_NODES) {
      const x = lonToCountryCell(node.lon);
      const y = latToCountryCell(node.lat);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(COUNTRY_GRID_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(COUNTRY_GRID_HEIGHT);
    }
  });

  test('북쪽이 y=0이다 — 위도가 클수록 위', () => {
    expect(latToCountryCell(39)).toBeLessThan(latToCountryCell(35));
  });

  test('동쪽이 x가 크다 — 울산이 여의도보다 오른쪽', () => {
    const yeouido = FRONT_NODES.find((n) => n.id === 'R1')!;
    const ulsan = FRONT_NODES.find((n) => n.id === 'R3')!;
    expect(lonToCountryCell(ulsan.lon)).toBeGreaterThan(lonToCountryCell(yeouido.lon));
  });

  test('울산이 여의도보다 남쪽이다', () => {
    const yeouido = FRONT_NODES.find((n) => n.id === 'R1')!;
    const ulsan = FRONT_NODES.find((n) => n.id === 'R3')!;
    expect(latToCountryCell(ulsan.lat)).toBeGreaterThan(latToCountryCell(yeouido.lat));
  });

  test('DMZ(38°N)가 격자 안에 있다 — 목업이 지목한 유일한 기준선', () => {
    const y = latToCountryCell(DMZ_LATITUDE);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(COUNTRY_GRID_HEIGHT);
  });
});

describe('반도 실루엣', () => {
  const cells = peninsulaCells();

  test('육지 셀이 실제로 만들어진다', () => {
    expect(cells.length).toBeGreaterThan(100);
  });

  test('전부 격자 안이다', () => {
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(COUNTRY_GRID_WIDTH);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThan(COUNTRY_GRID_HEIGHT);
    }
  });

  test('중복 좌표가 없다 — 겹친 사각형을 두 번 칠하지 않는다', () => {
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(cells.length);
  });

  test('노드가 육지 위에 선다 — 바다에 도시를 세우지 않는다', () => {
    const land = new Set(cells.map((c) => `${c.x},${c.y}`));
    for (const node of FRONT_NODES) {
      const key = `${lonToCountryCell(node.lon)},${latToCountryCell(node.lat)}`;
      expect(land.has(key)).toBe(true);
    }
  });
});

describe('★ 노드 상태는 카드 잠금과 같은 판정에서 나온다', () => {
  const statusOf = (id: string, progress: ReturnType<typeof emptyProgress>) =>
    nodeStatusOf(FRONT_NODES.find((n) => n.id === id)!, progress, isRegionLocked);

  test('진행도가 없으면 R1만 열려 있다', () => {
    const p = emptyProgress();
    expect(statusOf('R1', p)).toBe('available');
    expect(statusOf('R2', p)).toBe('locked');
    expect(statusOf('R3', p)).toBe('locked');
  });

  test('R1을 깨면 R1은 CLEARED, R2가 열린다', () => {
    const p = withCleared(emptyProgress(), 'R1');
    expect(statusOf('R1', p)).toBe('cleared');
    expect(statusOf('R2', p)).toBe('available');
    expect(statusOf('R3', p)).toBe('locked');
  });

  test('★ R0는 스테이지가 없다 — 선택 대상이 아니다', () => {
    expect(statusOf('R0', emptyProgress())).toBe('nostage');
    expect(FRONT_NODES.find((n) => n.id === 'R0')?.stageId).toBeNull();
  });

  test('모든 상태에 표시 문구가 있다', () => {
    for (const status of ['cleared', 'available', 'locked', 'nostage'] as const) {
      expect(NODE_STATUS_LABEL[status].length).toBeGreaterThan(0);
    }
  });
});

describe('★ 브리핑 숫자는 전부 STAGES에서 온다', () => {
  const node = FRONT_NODES.find((n) => n.id === 'R1')!;

  test('웨이브 수는 상수에서', () => {
    const lines = briefingFor(node, 'dusk');
    expect(lines.find((l) => l.label === '웨이브')?.value).toBe(String(WAVE_COUNT));
  });

  test('추천 AUM과 필요 지출이 STAGES 값이다', () => {
    const lines = briefingFor(node, 'dusk');
    expect(lines.find((l) => l.label === '추천 AUM')?.value).toBe(
      STAGES.R1.startingAum.toLocaleString('ko-KR'),
    );
    expect(lines.find((l) => l.label === '필요 지출')?.value).toContain(
      STAGES.R1.requiredSpend.toLocaleString('ko-KR'),
    );
  });

  test('목업이 규정한 4항목이 전부 있다 — 웨이브·추천AUM·보상·시간대', () => {
    const labels = briefingFor(node, 'dusk').map((l) => l.label);
    expect(labels).toContain('웨이브');
    expect(labels).toContain('추천 AUM');
    expect(labels).toContain('보상');
    expect(labels).toContain('시간대');
  });

  test('시간대는 호출부가 넘긴 값을 그대로 쓴다 — 여기서 표를 다시 만들지 않는다', () => {
    expect(briefingFor(node, 'noon').find((l) => l.label === '시간대')?.value).toBe('noon');
  });

  test('R0 브리핑은 "스테이지가 없다"를 말한다 — 빈 화면을 내지 않는다', () => {
    const r0 = FRONT_NODES.find((n) => n.id === 'R0')!;
    const lines = briefingFor(r0, 'dusk');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.value.includes('아직 없다'))).toBe(true);
  });
});

describe('연결선', () => {
  test('모든 링크가 실재하는 노드를 잇는다', () => {
    const ids = new Set(FRONT_NODES.map((n) => n.id));
    for (const [from, to] of FRONT_LINKS) {
      expect(ids.has(from)).toBe(true);
      expect(ids.has(to)).toBe(true);
    }
  });

  test('진격 순서대로 이어진다 — 사옥에서 시작한다', () => {
    expect(FRONT_LINKS[0]?.[0]).toBe('R0');
  });
});
