import { Cookie, CookieJar, canonicalDomain } from "tough-cookie";

import { isBrowser } from "../util";

export type ResponseTransformer<T = string> = (response: Response, request: Request) => T | PromiseLike<T>;

let defaultResponseTransformer: ResponseTransformer = (response: Response) => response.text();
let defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export class RequestError extends Error {
  constructor(message: string, readonly request: Request, readonly response?: Response, readonly cause?: Error) {
    super(message, cause);
    this.name = this.constructor.name;
  }
}

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
  /**
   * 最大重试次数
   */
  maxRetry?: number;
  useDefaultUserAgent?: boolean;
  responseTransformer?: ResponseTransformer<T>;
}

const globalOptions: CommonRequestOptions<never> = {};

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
 * 发送一个请求，可选择请求超时时间
 *
 * @param url - 请求地址
 * @param _options - 请求选项
 * @returns 响应内容
 */
async function _request<T = string>(url: string | URL, _options: CommonRequestOptions<T> = { method: 'GET' }): Promise<T> {
  const combineOptions: CommonRequestOptions<T> = {
    ...globalOptions,
    ..._options,
  }
  const { timeout = 120 * 1000, maxRetry = 0 } = combineOptions;
  const doReq = async () => {
    if (Number.isSafeInteger(timeout) && timeout > 0) {
      combineOptions.signal = AbortSignal.timeout(timeout);
    }
    const request = createRequest(url, combineOptions);
    return await fetch(request)
      .then((res) => {
        if (!res.ok) {
          if (res.status >= 500 && res.status <= 599) {
            throw new RequestError(`请求失败(HTTP Status ${res.status})，可能是临时网络波动，如果长时间失败请联系开发者`, request, res);
          } else {
            throw new RequestError(`HTTP响应状态：${res.status}`, request, res);
          }
        }
        if (combineOptions.responseTransformer) {
          return combineOptions.responseTransformer(res, request);
        }
        return defaultResponseTransformer(res, request) as T;
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') {
          throw new RequestError(`请求超时，强制停止请求(${String(timeout)}ms)`, request);
        }
        throw err;
      });
  }
  if (Number.isSafeInteger(maxRetry) && maxRetry > 0) {
    let counter = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      counter++;
      try {
        return await doReq();
      } catch (e) {
        if (counter > maxRetry) {
          throw e;
        } else {
          console.log(`网络请求失败，进行第${counter}次重试，错误信息：`);
          console.error(e);
        }
      }
    }
  } else {
    return await doReq();
  }
}

/**
 * GET请求
 *
 * @param url - 请求地址
 * @param options - 请求选项
 * @returns 响应内容
 */
function _get<T = string>(url: string | URL, options: CommonRequestOptions<T> = {}): Promise<T> {
  return _request(url, { method: 'GET', ...options});
}

/**
 * POST请求
 *
 * @param url - 请求地址
 * @param options - 请求选项
 * @returns 响应内容
 */
function _post<T = string>(url: string | URL, options: CommonRequestOptions<T> = {}): Promise<T> {
  return _request(url, { method: 'POST', ...options});
}

export class HttpClient {
  cookieJar = new CookieJar(undefined, { prefixSecurity: "unsafe-disabled" });

  private handleResponseSetCookie(response: Response, _url: string) {
    const url = canonicalDomain(_url)!;
    response.headers.getSetCookie()
      .map(it => Cookie.parse(it))
      .forEach(it => {
        if (it) this.cookieJar.setCookieSync(it, url);
      });
  }

  async request<T = string>(_url: string | URL, _options: CommonRequestOptions<T> = { method: "GET" }): Promise<T> {
    const url = typeof _url === "string" ? new URL(_url) : _url;
    const cookieUrl = canonicalDomain(url.toString())!;
    const cookies = this.cookieJar.getCookiesSync(cookieUrl).map(it => [it.key, it.value]);
    if (cookies.length > 0) {
      const reqCookies = Object.fromEntries(cookies) as Record<string, string>;
      const headers = new Headers(_options.headers);
      const manualCookie = headers.get("cookie");
      if (typeof manualCookie === "string") {
        manualCookie.split(";")
          .map(it => Cookie.parse(it))
          .forEach(it => {
            if (it) reqCookies[it.key] = it.value;
          });
      }
      headers.set("Cookie", Object.entries(reqCookies)
        .map(it => `${it[0]}=${it[1]}`)
        .join("; ")
      );
      _options.headers = headers;
    }
    const oldTransformer = _options.responseTransformer ?? defaultResponseTransformer;
    _options.responseTransformer = async (res, req) => {
      this.handleResponseSetCookie(res, req.url);
      return (await oldTransformer(res, req)) as T;
    };
    return _request(url, _options)
      .catch((err: Error)=> {
        if (err instanceof RequestError && err.response) {
          this.handleResponseSetCookie(err.response, err.request.url);
        }
        throw err;
      });
  }

  async get<T = string>(url: string | URL, options: CommonRequestOptions<T> = {}): Promise<T> {
    return this.request(url, { method: 'GET', ...options});
  }

  async post<T = string>(url: string | URL, options: CommonRequestOptions<T> = {}): Promise<T> {
    return this.request(url, { method: 'POST', ...options});
  }
}

export const Http = {
  fetch,
  request: _request,
  get: _get,
  post: _post,
  globalOptions,
  setDefaultResponseTransformer: (transformer: typeof defaultResponseTransformer) => {
    defaultResponseTransformer = transformer;
  },
  setDefaultUserAgent: (userAgent: string) => {
    defaultUserAgent = userAgent;
  },
  RequestError,
};
