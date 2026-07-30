#!/usr/bin/env node
/** 픽스처 생성 진입점. `npm run assets:fixtures` 가 이 파일을 실행합니다. */
import { main } from './build-fixtures.js';

process.exitCode = main();
