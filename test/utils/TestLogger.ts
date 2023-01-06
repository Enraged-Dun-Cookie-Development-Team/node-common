import { createDefaultConsoleTransport, createLogger, LogLevel } from '../../src/common/logger';
import { HtmlReporterTransport } from './HtmlReporterTransport';

import console from 'console';
global.console = console;

export function createTestLogger(module: string) {
  return createLogger({
    name: 'test-logger',
    transports: [createDefaultConsoleTransport(), HtmlReporterTransport],
    defaultModule: module,
    level: LogLevel.TRACE,
  });
}
