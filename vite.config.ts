import { defineConfig } from 'vitest/config';

/**
 * GitHub Pages 배포 경로.
 * 저장소가 https://github.com/HD152521/NHN_Game_Investing 이므로
 * 산출물은 https://hd152521.github.io/NHN_Game_Investing/ 아래에 놓인다.
 * 이 값이 없으면 dist/index.html 의 자산 경로가 `/assets/...` 로 나와
 * Pages 에서 전부 404 가 된다.
 */
const PAGES_BASE = '/NHN_Game_Investing/';

export default defineConfig(({ command }) => ({
  // 개발 서버는 기존대로 http://localhost:5173/ 에서 뜨도록 '/' 를 유지한다.
  // (base 를 무조건 걸면 dev 진입 URL 이 /NHN_Game_Investing/ 로 바뀌어 문서와 어긋난다.)
  base: command === 'build' ? PAGES_BASE : '/',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
  test: {
    /**
     * 기본 환경은 node 를 명시적으로 유지한다.
     * 현재 118 파일 / 1,975 테스트가 전부 node 환경을 전제로 통과하고 있으므로
     * 전역을 jsdom 으로 바꾸면 안 된다.
     *
     * DOM 배선 테스트(§19-7)가 필요한 파일은 **파일 단위로 옵트인**한다.
     * 파일 최상단에 아래 docblock 한 줄을 넣으면 그 파일만 jsdom 으로 돈다:
     *
     *   // @vitest-environment jsdom
     *
     * (vitest 4 에서 environmentMatchGlobs 는 제거됐다. docblock 이 현행 API 다.)
     */
    environment: 'node',
  },
}));
