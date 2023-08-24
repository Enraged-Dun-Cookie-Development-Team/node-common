import * as crossFetch from 'cross-fetch';
import { isBrowser } from "../util";

let fetch: typeof globalThis.fetch;
let Request: typeof globalThis.Request;
let Response: typeof globalThis.Response;

if (Object.hasOwn(globalThis, 'fetch')) {
  fetch = globalThis.fetch;
  Request = globalThis.Request;
  Response = globalThis.Response;
} else {
  fetch = crossFetch.fetch;
  Request = crossFetch.Request;
  Response = crossFetch.Response;
}

let defaultResponseTransformer = (response: Response) => response.text();
let defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36';

export interface CommonRequestOptions<T = string> extends RequestInit {
  /**
   * 是否加时间戳，用于绕过缓存
   */
  appendTimestamp?: boolean;
  /**
   * 时间戳请求参数
   */
  timestampParamName?: string;
  /**
   * 请求超时时间
   */
  timeout?: number;
  useDefaultUserAgent?: boolean;
  responseTransformer?: (response: Response) => Promise<T>;
}
// TODO 使用类型体操保证当且仅当responseTransformer设置时使用泛型，其它情况使用string

/**
 * 创建一个请求，可选择是否加时间戳
 *
 * @param reqUrl - 请求地址
 * @param options - 请求选项
 * @returns 创建好的Request对象
 */
function createRequest<T = string>(reqUrl: string | URL, options: CommonRequestOptions<T>): Request {
  const { appendTimestamp = false, timestampParamName = 't', useDefaultUserAgent = !isBrowser } = options;
  const url = typeof reqUrl === 'string' ? new URL(reqUrl) : reqUrl;
  if (appendTimestamp) {
    if (url.searchParams.has(timestampParamName)) {
      throw new Error(`时间戳参数${timestampParamName}冲突：${url.toString()}`);
    }
    url.searchParams.set(timestampParamName, Date.now().toString());
  }
  const request = new Request(url, options);
  if (useDefaultUserAgent  && !request.headers.has('user-agent')) {
    request.headers.set('user-agent', defaultUserAgent);
  }
  return request;
}

/**
 * 创建一个请求，可选择请求超时时间
 *
 * @param url - 请求地址
 * @param options - 请求选项
 * @returns 响应内容
 */
async function request<T = string>(url: string | URL, options: CommonRequestOptions<T> = { method: 'GET' }): Promise<T> {
  let { timeout } = options;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (!timeout) {
    // 默认超时120秒
    timeout = 120 * 1000;
  }
  if (Number.isSafeInteger(timeout) && timeout > 0) {
    // 这里用AbortSignal.timeout这个静态方法更简洁，但是浏览器至少是22年5月的版本才兼容这个方法，而且IDE似乎也不能识别这个方法(可能是哪里的设置没有用最新js版本？)
    const controller = new AbortController();
    options.signal = controller.signal;
    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);
  }
  const request = createRequest(url, options);
  return await fetch(request)
    .then((res) => {
      if (options.responseTransformer) {
        return options.responseTransformer(res);
      }
      return defaultResponseTransformer(res) as unknown as T;
    })
    .catch((err: Error) => {
      if (err.name === 'AbortError') {
        throw new Error(`请求超时，强制停止请求(${String(timeout)}ms)`);
      }
      throw err;
    })
    .finally(() => {
      if (typeof timeoutId !== 'undefined') {
        clearTimeout(timeoutId);
      }
    });
}

/**
 * GET请求
 *
 * @param url - 请求地址
 * @param options - 请求选项
 * @returns 响应内容
 */
function get<T = string>(url: string | URL, options: CommonRequestOptions<T> = {}): Promise<T> {
  return request(url, { method: 'GET', ...options});
}

/**
 * POST请求
 *
 * @param url - 请求地址
 * @param options - 请求选项
 * @returns 响应内容
 */
function post<T = string>(url: string | URL, options: CommonRequestOptions<T> = {}): Promise<T> {
  return request(url, { method: 'POST', ...options});
}

export const Http = {
  fetch,
  request,
  get,
  post,
  setDefaultResponseTransformer(transformer: typeof defaultResponseTransformer) {
    defaultResponseTransformer = transformer;
  },
  setDefaultUserAgent(userAgent: string) {
    defaultUserAgent = userAgent;
  },
};
