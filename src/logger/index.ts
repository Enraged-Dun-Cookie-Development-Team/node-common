// 调研了一些日志库
// 像pino和winston这俩是看起来很不错
// 但是对browser环境支持极其不友好(无任何文档告知browser的功能兼容情况 测试下来至少有一个功能不兼容 但不知道具体到底有多少坑)
//
// 像loglevel这种小巧也同时兼容node和browser，但是功能少到不如自己写一个
//
// 综上决定自己写一个满足需求的logger

import { DateTime } from 'luxon';

/**
 * 日志等级，值越高输出越详细
 */
export enum LogLevel {
  /**
   * 实际范围 <= 20
   */
  FATAL = 20,
  /**
   * 20 < 实际范围 <= 40
   */
  WARN = 40,
  /**
   * 40 < 实际范围 <= 60
   */
  INFO = 60,
  /**
   * 60 < 实际范围 <= 80
   */
  DEBUG = 80,
  /**
   * 80 < 实际范围
   */
  TRACE = 100,
}

export class LogItem {
  /**
   *
   * @param time 日志时间
   * @param level 日志等级
   * @param msg 日志信息
   * @param module 所属模块
   * @param extra 额外信息
   * @param error 发生的异常
   */
  constructor(
    readonly time: DateTime,
    readonly level: LogLevel | number,
    readonly msg: unknown[],
    readonly module?: string,
    readonly extra?: Record<string, unknown>,
    readonly error?: Error
  ) {}

  levelToString(): string {
    let level: string;
    switch (this.level) {
      case LogLevel.TRACE:
        level = 'TRACE';
        break;
      case LogLevel.DEBUG:
        level = 'DEBUG';
        break;
      case LogLevel.INFO:
        level = 'INFO';
        break;
      case LogLevel.WARN:
        level = 'WARN';
        break;
      case LogLevel.FATAL:
        level = 'FATAL';
        break;
      default:
        level = `L${this.level}`;
        break;
    }
    return level;
  }

  timeToString(): string {
    return this.time.toFormat('yyyy-MM-dd HH:mm:ss');
  }

  /**
   * 使用默认格式转换成字符串
   */
  toString(): string {
    const level = this.levelToString();
    const module = this.module ? `(${this.module})` : '';
    const msg = this.msg.map((it) => (typeof it === 'string' ? it : JSON.stringify(it))).join(' ');
    const extra = this.extra ? '\n  Extra: ' + JSON.stringify(this.extra) : '';
    const time = this.timeToString();
    const error = this.error ? '\n  ' + this.error.stack! : '';
    return `[${time}][${level}]${module} ${msg}${extra}${error}\n`;
  }
}

export interface Transport {
  readonly name: string;

  get level(): number | undefined;

  set level(value: number | undefined);

  handle(item: LogItem): void;

  close(): Promise<void>;
}

// 把LogLevel枚举转换成kv对象
const defaultLevels = Object.entries(LogLevel)
  .filter((v) => typeof v[1] === 'number')
  .reduce<Partial<Record<Lowercase<keyof typeof LogLevel>, LogLevel>>>((map, [k, v]) => {
    map[k.toLowerCase() as Lowercase<keyof typeof LogLevel>] = v as LogLevel;
    return map;
  }, {}) as { [key in Lowercase<keyof typeof LogLevel>]: LogLevel };

interface LoggerOptions {
  name: string;
  transports: Transport[];
  level?: LogLevel | number;
  levels?: Record<string, LogLevel | number>;
  defaultModule?: string;
}

type ExtraLogData = Record<string, unknown> & {
  module?: string;
  error?: Error;
};

export interface Logger {
  get level(): LogLevel | number;

  set level(level: LogLevel | number);

  fatal(msg: string, ...additionMsg: unknown[]): void;

  fatal(extra: ExtraLogData, ...msg: unknown[]): void;

  warn(msg: string, ...additionMsg: unknown[]): void;

  warn(extra: ExtraLogData, ...msg: unknown[]): void;

  info(msg: string, ...additionMsg: unknown[]): void;

  info(extra: ExtraLogData, ...msg: unknown[]): void;

  debug(msg: string, ...additionMsg: unknown[]): void;

  debug(extra: ExtraLogData, ...msg: unknown[]): void;

  trace(msg: string, ...additionMsg: unknown[]): void;

  trace(extra: ExtraLogData, ...msg: unknown[]): void;

  log(level: LogLevel | number, extraOrMsg: string | ExtraLogData, ...additionMsg: unknown[]): void;

  close(): Promise<void>;

  /**
   * 创建一个新的日志器，未提供的配置选项会复制当前日志器的配置
   * syncLevel为true时创建出的日志器将同步使用当前日志器的level(同步是双向的)，默认为true
   */
  with(options?: Partial<LoggerOptions> & { syncLevel?: boolean }): Logger;
}

class LevelDelegation {
  constructor(public level: LogLevel | number) {}
}

export class LoggerImpl implements Logger {
  private readonly transports: Transport[];
  private readonly levels: Record<string, LogLevel | number>;
  private readonly defaultModule?: string;
  private readonly levelDelegation: LevelDelegation;

  /**
   * 值越高输出越详细
   */
  get level(): LogLevel | number {
    return this.levelDelegation.level;
  }

  set level(val) {
    this.levelDelegation.level = val;
  }

  constructor(private readonly options: LoggerOptions, levelDelegation?: LevelDelegation) {
    this.levelDelegation = levelDelegation || new LevelDelegation(typeof options.level === 'undefined' ? LogLevel.INFO : options.level);
    this.levels = { ...defaultLevels, ...options.levels };
    this.transports = options.transports || [];
    this.defaultModule = options.defaultModule;
  }

  close(): Promise<void> {
    return Promise.allSettled(this.transports.map((it) => it.close())).then(() => undefined);
  }

  fatal(extraOrMsg: string | Record<string, unknown>, ...additionMsg: unknown[]) {
    this.log(LogLevel.FATAL, extraOrMsg, ...additionMsg);
  }

  warn(extraOrMsg: string | Record<string, unknown>, ...additionMsg: unknown[]) {
    this.log(LogLevel.WARN, extraOrMsg, ...additionMsg);
  }

  info(extraOrMsg: string | Record<string, unknown>, ...additionMsg: unknown[]) {
    this.log(LogLevel.INFO, extraOrMsg, ...additionMsg);
  }

  debug(extraOrMsg: string | Record<string, unknown>, ...additionMsg: unknown[]) {
    this.log(LogLevel.DEBUG, extraOrMsg, ...additionMsg);
  }

  trace(extraOrMsg: string | Record<string, unknown>, ...additionMsg: unknown[]) {
    this.log(LogLevel.TRACE, extraOrMsg, ...additionMsg);
  }

  log(level: LogLevel | number, extraOrMsg: string | ExtraLogData, ...additionMsg: unknown[]) {
    const transports = this.transports.filter((it) => {
      const checkLevel = typeof it.level === 'number' ? it.level : this.level;
      return level <= checkLevel;
    });
    if (transports.length === 0) {
      return;
    }
    let msg: unknown[];
    let extra: Record<string, unknown> | undefined;
    let error: Error | undefined;
    let module = this.defaultModule;
    if (typeof extraOrMsg === 'string') {
      msg = [extraOrMsg, ...additionMsg];
    } else {
      if (extraOrMsg.module) {
        module = extraOrMsg.module;
        delete extraOrMsg.module;
      }
      if (extraOrMsg.error) {
        error = extraOrMsg.error;
        delete extraOrMsg.error;
      }
      msg = additionMsg;
      extra = extraOrMsg;
    }
    const item = new LogItem(DateTime.now(), level, msg, module, extra, error);

    for (const transport of transports) {
      transport.handle(item);
    }
  }

  with(options: Partial<LoggerOptions> & { syncLevel?: boolean } = {}): Logger {
    let levelDelegation: LevelDelegation | undefined;
    if (options.syncLevel || options.syncLevel === undefined) {
      levelDelegation = this.levelDelegation;
    }
    return new LoggerImpl({ ...this.options, ...options }, levelDelegation);
  }
}

export function createDefaultConsoleTransport(level?: number): Transport {
  return {
    name: 'Console',
    level: level,
    handle(item: LogItem): void {
      const level = item.levelToString();
      const module = item.module ? `(${item.module})` : '';
      const msg = item.msg.map((it) => (typeof it === 'string' ? it : JSON.stringify(it)));
      const time = item.timeToString();
      if (item.error) {
        msg.push('\n  ' + item.error.stack!);
      }
      const msgToPrint = [`%c[${time}]%c[${level}]${module}`, 'color: gray', 'color: black', ...msg];
      // LogLevel枚举常量作为分界线，往上的是更高等级的日志，往下的是当前等级或更低等级的日志
      // 等级越高的日志可能调用越频繁，所以等级高的的先判断
      if (item.level > LogLevel.INFO) {
        // debug和trace两个级别都使用console.debug，除了特殊情况以外，通常不需要调用栈，故不使用console.trace
        console.debug(...msgToPrint);
      } else if (item.level > LogLevel.WARN) {
        console.info(...msgToPrint);
      } else if (item.level > LogLevel.FATAL) {
        console.warn(...msgToPrint);
      } else {
        console.error(...msgToPrint);
      }
    },
    close() {
      return Promise.resolve();
    },
  };
}

export const DefaultLogger: Logger = new LoggerImpl({ name: 'default', transports: [createDefaultConsoleTransport()] });

export function createLogger(options: LoggerOptions): Logger;
export function createLogger(name: string): Logger;
export function createLogger(nameOrOptions: string | LoggerOptions): Logger {
  return new LoggerImpl(
    typeof nameOrOptions === 'string'
      ? {
          name: nameOrOptions,
          transports: [createDefaultConsoleTransport()],
        }
      : nameOrOptions
  );
}
