import { describe, expect, test } from 'vitest';

/**
 * 세계지도 검증.
 *
 * 지도 데이터는 눈으로 보면 그럴듯한데 값이 틀리기 쉬운 종류다(격자 밖으로 나가거나,
 * 큰 대륙이 작은 지역을 먹거나, 사각형이 0칸으로 구워지거나). 그래서 **래스터화 결과**를
 * 직접 센다 — 사각형 목록을 읽는 것으로는 그 실패를 잡을 수 없다.
 */
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  STATUS_LABEL,
  WORLD_ORDER,
  WORLD_REGIONS,
  buildBriefingMarkup,
  buildFootMarkup,
  buildSidebarMarkup,
  buildWorldMapMarkup,
  conqueredCount,
  isPlayable,
  latToCell,
  lonToCell,
  statusOf,
  worldCells,
  worldRegionFor,
} from './world-map';
import { emptyProgress, withCleared } from './progress';
import type { GameProgress } from './progress';

const cleared = (...ids: readonly ('R1' | 'R2' | 'R3')[]): GameProgress =>
  ids.reduce<GameProgress>((progress, id) => withCleared(progress, id), emptyProgress());

describe('지역 정의', () => {
  test('10지역이다', () => {
    expect(WORLD_REGIONS).toHaveLength(10);
    expect(WORLD_ORDER).toHaveLength(10);
  });

  test('ID가 중복되지 않는다', () => {
    expect(new Set(WORLD_ORDER).size).toBe(10);
  });

  test('모든 지역이 지도에 그려질 땅을 갖는다', () => {
    for (const region of WORLD_REGIONS) {
      expect(region.land.length).toBeGreaterThan(0);
    }
  });

  test('★ 플레이 가능한 지역은 한국뿐이다 — 지도에 있다고 갈 수 있는 것이 아니다', () => {
    const playable = WORLD_REGIONS.filter(isPlayable);
    expect(playable.map((region) => region.id)).toEqual(['korea']);
  });

  test('한국의 스테이지는 실제 STAGES와 맞물린다', () => {
    const korea = WORLD_REGIONS.find((region) => region.id === 'korea');
    expect(korea?.playableStages).toEqual(['R1', 'R2', 'R3']);
  });
});

describe('상태 판정', () => {
  const korea = WORLD_REGIONS[0]!;
  const japan = WORLD_REGIONS[1]!;

  test('아무것도 안 깼으면 진행 중이다', () => {
    expect(statusOf(korea, emptyProgress())).toBe('active');
  });

  test('일부만 깬 상태도 진행 중이다', () => {
    expect(statusOf(korea, cleared('R1', 'R2'))).toBe('active');
  });

  test('전부 깨면 점령 완료다', () => {
    expect(statusOf(korea, cleared('R1', 'R2', 'R3'))).toBe('unlocked');
  });

  test('스테이지가 없는 지역은 진행도와 무관하게 준비 중이다', () => {
    expect(statusOf(japan, cleared('R1', 'R2', 'R3'))).toBe('locked');
  });

  test('점령 수는 완전 클리어한 지역만 센다', () => {
    expect(conqueredCount(emptyProgress())).toBe(0);
    expect(conqueredCount(cleared('R1', 'R2'))).toBe(0);
    expect(conqueredCount(cleared('R1', 'R2', 'R3'))).toBe(1);
  });

  test('상태 라벨이 세 가지 모두 있다', () => {
    expect(STATUS_LABEL.active).toBe('진행 중');
    expect(STATUS_LABEL.unlocked).toBe('점령 완료');
    expect(STATUS_LABEL.locked).toBe('준비 중');
  });
});

describe('좌표 변환', () => {
  test('경도 -180이 좌단, 180이 우단이다', () => {
    expect(lonToCell(-180)).toBe(0);
    expect(lonToCell(180)).toBe(GRID_WIDTH);
  });

  test('위도 80이 상단이다', () => {
    expect(latToCell(80)).toBe(0);
  });

  test('북쪽일수록 y가 작다', () => {
    expect(latToCell(60)).toBeLessThan(latToCell(0));
    expect(latToCell(0)).toBeLessThan(latToCell(-40));
  });

  test('한국 경도(127°E)가 격자 오른쪽 절반에 온다', () => {
    expect(lonToCell(127)).toBeGreaterThan(GRID_WIDTH / 2);
  });
});

describe('래스터화', () => {
  const cells = worldCells();

  test('셀이 만들어진다', () => {
    expect(cells.length).toBeGreaterThan(500);
  });

  test('★ 모든 셀이 격자 안에 있다 — 캔버스 밖으로 새는 칸이 없어야 한다', () => {
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0);
      expect(cell.x).toBeLessThan(GRID_WIDTH);
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThan(GRID_HEIGHT);
    }
  });

  test('한 칸에 한 지역만 온다 (겹침이 해소된다)', () => {
    const keys = cells.map((cell) => `${cell.x},${cell.y}`);
    expect(new Set(keys).size).toBe(cells.length);
  });

  test('★ 모든 지역이 최소 한 칸은 그려진다 — 큰 대륙에 먹혀 사라지지 않는다', () => {
    const drawn = new Set(cells.map((cell) => cell.region));
    for (const region of WORLD_REGIONS) {
      expect(drawn.has(region.id)).toBe(true);
    }
  });

  test('한국은 작지만 중국에 먹히지 않는다 (배열 순서가 앞선다)', () => {
    const korea = cells.filter((cell) => cell.region === 'korea');
    expect(korea.length).toBeGreaterThan(0);
  });

  test('두 번 불러도 같은 결과다 (결정론)', () => {
    expect(worldCells().length).toBe(cells.length);
  });
});

describe('입력 검증', () => {
  test('아는 ID는 지역을 돌려준다', () => {
    expect(worldRegionFor('korea')?.name).toBe('한국');
  });

  test('모르는 값·undefined는 null이다', () => {
    expect(worldRegionFor('atlantis')).toBeNull();
    expect(worldRegionFor(undefined)).toBeNull();
  });
});

describe('마크업', () => {
  test('사이드바에 10줄이 나온다', () => {
    const html = buildSidebarMarkup(emptyProgress());
    expect(html.match(/data-action="select-world-region"/g)).toHaveLength(10);
  });

  test('사이드바가 진행도를 반영한다', () => {
    expect(buildSidebarMarkup(cleared('R1', 'R2', 'R3'))).toContain('점령 완료');
  });

  test('플레이 가능한 지역의 진입 버튼은 열려 있다', () => {
    const korea = WORLD_REGIONS[0]!;
    const html = buildBriefingMarkup(korea, emptyProgress());
    expect(html).toContain('진 입');
    expect(html).not.toContain('disabled');
  });

  test('★ 준비 중 지역의 진입 버튼은 잠기고, 이유를 말한다', () => {
    const japan = WORLD_REGIONS[1]!;
    const html = buildBriefingMarkup(japan, emptyProgress());
    expect(html).toContain('disabled');
    expect(html).toContain('준비 중');
  });

  test('하단 상태줄이 점령 수를 말한다', () => {
    expect(buildFootMarkup(emptyProgress())).toBe('점령 0 / 10 지역');
    expect(buildFootMarkup(cleared('R1', 'R2', 'R3'))).toBe('점령 1 / 10 지역');
  });

  test('오버레이는 hidden으로 태어난다', () => {
    expect(buildWorldMapMarkup()).toContain('hidden');
  });

  test('지도 캔버스에 접근성 레이블이 붙는다', () => {
    expect(buildWorldMapMarkup()).toContain('role="img"');
  });
});
