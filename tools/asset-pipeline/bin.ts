#!/usr/bin/env node
/** CLI 진입점. 로직은 cli.ts 에 있고 여기서는 종료 코드만 프로세스로 넘깁니다. */
import { main } from './cli.js';

process.exitCode = main(process.argv.slice(2));
