import { fetch, Request, Response } from 'cross-fetch';

let defaultResponseTransformer = (response: Response) => response.text();
let defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36';

export interface CommonRequestOptions extends RequestInit {
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
  responseTransformer?: typeof defaultResponseTransformer;
}

/**
 * 创建一个请求，可选择是否加时间戳
 *
 * @param reqUrl - 请求地址
 * @param options - 请求选项
 * @returns 创建好的Request对象
 */
function createRequest(reqUrl: string | URL, options: CommonRequestOptions): Request {
  const { appendTimestamp = false, timestampParamName = 't' } = options;
  const url = typeof reqUrl === 'string' ? new URL(reqUrl) : reqUrl;
  if (appendTimestamp) {
    if (url.searchParams.has(timestampParamName)) {
      throw new Error(`时间戳参数${timestampParamName}冲突：${url.toString()}`);
    }
    url.searchParams.set(timestampParamName, Date.now().toString());
  }
  const request = new Request(url, options);
  if (!request.headers.has('User-Agent')) {
    request.headers.set('User-Agent', defaultUserAgent);
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
async function request(url: string | URL, options: CommonRequestOptions = { method: 'GET' }): Promise<string> {
  const { timeout } = options;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (typeof timeout === 'number' && Number.isSafeInteger(timeout) && timeout > 0) {
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
      return defaultResponseTransformer(res);
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
function get(url: string | URL, options: CommonRequestOptions = {}): Promise<string> {
  return request(url, { method: 'GET', ...options});
}

/**
 * POST请求
 *
 * @param url - 请求地址
 * @param options - 请求选项
 * @returns 响应内容
 */
function post(url: string | URL, options: CommonRequestOptions = {}): Promise<string> {
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
