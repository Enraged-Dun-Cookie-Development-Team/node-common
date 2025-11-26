import { Http, HttpClient, RequestError } from '../../src/request';
import { Cookie, CookieJar } from 'tough-cookie';

describe('request module', () => {
  const mockFetch = jest.spyOn(globalThis, 'fetch');

  // 创建一个新的 mockResponse 对象而不是修改现有对象的只读属性
  const createMockResponse = (overrides: Partial<Response> = {}) => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: jest.fn().mockResolvedValue('response text'),
      headers: new Headers(),
      clone: jest.fn(),
      ...overrides
    } as unknown as Response;
  };

  let mockResponse: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    // 每次测试前创建新的 mockResponse 实例
    mockResponse = createMockResponse();
    mockFetch.mockResolvedValue(mockResponse);
  });

  describe('Http object', () => {
    test('should export fetch, request, get, post methods', () => {
      expect(Http.fetch).toBeDefined();
      expect(Http.request).toBeDefined();
      expect(Http.get).toBeDefined();
      expect(Http.post).toBeDefined();
    });

    test('should export globalOptions', () => {
      expect(Http.globalOptions).toEqual({});
    });

    test('should export RequestError', () => {
      expect(Http.RequestError).toBe(RequestError);
    });
  });

  describe('_request function', () => {
    test('should make a basic GET request', async () => {
      const result = await Http.request('https://example.com');
      expect(result).toBe('response text');
      expect(mockFetch).toHaveBeenCalled();
    });

    test('should make a POST request', async () => {
      await Http.post('https://example.com');
      expect(mockFetch).toHaveBeenCalled();
      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.method).toBe('POST');

      await Http.post('https://example.com', { method: 'POST', body: 'data' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should use custom response transformer', async () => {
      const customTransformer = jest.fn().mockReturnValue('custom-data') as () => string;
      const result = await Http.request('https://example.com', {
        responseTransformer: customTransformer
      });

      expect(result).toEqual('custom-data');
      expect(customTransformer).toHaveBeenCalled();
    });

    test('should throw RequestError for non-ok responses (4xx)', async () => {
      // 创建一个新的带有错误状态的响应
      const errorResponse = createMockResponse({
        ok: false,
        status: 404
      });

      mockFetch.mockResolvedValueOnce(errorResponse);
      await expect(Http.request('https://example.com'))
        .rejects
        .toThrow(RequestError);

      mockFetch.mockResolvedValueOnce(errorResponse);
      await expect(Http.request('https://example.com'))
        .rejects
        .toThrow('HTTP响应状态：404');
    });

    test('should throw RequestError for non-ok responses (5xx)', async () => {
      // 创建一个新的带有服务器错误状态的响应
      const errorResponse = createMockResponse({
        ok: false,
        status: 500
      });

      mockFetch.mockResolvedValueOnce(errorResponse);
      await expect(Http.request('https://example.com'))
        .rejects
        .toThrow(RequestError);

      mockFetch.mockResolvedValueOnce(errorResponse);
      await expect(Http.request('https://example.com'))
        .rejects
        .toThrow('请求失败(HTTP Status 500)，可能是临时网络波动，如果长时间失败请联系开发者');
    });

    test('should handle timeout', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          const err = new Error('timeout');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 1000);
        });
      });

      await expect(Http.request('https://example.com', { timeout: 100 }))
        .rejects
        .toThrow(RequestError);

      await expect(Http.request('https://example.com', { timeout: 100 }))
        .rejects
        .toThrow('请求超时，强制停止请求(100ms)');
    });

    test('should add timestamp parameter when appendTimestamp is true', async () => {
      await Http.request('https://example.com', { appendTimestamp: true });

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      const url = new URL(calledRequest.url);
      expect(url.searchParams.has('t')).toBeTruthy();
      expect(url.searchParams.get('t')).toMatch(/\d+/);
    });

    test('should throw error when timestamp parameter conflicts', async () => {
      await expect(Http.request('https://example.com?t=existing', { appendTimestamp: true }))
        .rejects
        .toThrow(/时间戳参数t冲突/);
    });

    test('should use custom timestamp parameter name', async () => {
      await Http.request('https://example.com', {
        appendTimestamp: true,
        timestampParamName: 'custom_ts'
      });


      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      const url = new URL(calledRequest.url);
      expect(url.searchParams.has('custom_ts')).toBeTruthy();
    });

    test('should set default user agent when not in browser', async () => {
      await Http.request('https://example.com');

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.headers.get('user-agent')).toBe(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      );
    });

    test('should not override existing user agent', async () => {
      await Http.request('https://example.com', {
        headers: { 'user-agent': 'Custom-Agent' }
      });

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.headers.get('user-agent')).toBe('Custom-Agent');
    });

    test('should retry requests when maxRetry is set', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce(mockResponse);

      const result = await Http.request('https://example.com', { maxRetry: 3 });
      expect(result).toBe('response text');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should throw error after max retries exceeded', async () => {
      const persistentError = new Error('persistent network error');
      mockFetch.mockRejectedValue(persistentError);

      await expect(Http.request('https://example.com', { maxRetry: 2 }))
        .rejects
        .toThrow('persistent network error');

      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('_get and _post functions', () => {
    test('get should make a GET request', async () => {
      const result = await Http.get('https://example.com');
      expect(result).toBe('response text');
      expect(mockFetch).toHaveBeenCalled();

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.method).toBe('GET');
    });

    test('post should make a POST request', async () => {
      await Http.post('https://example.com', { body: 'data' });
      expect(mockFetch).toHaveBeenCalled();

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.method).toBe('POST');
    });
  });

  describe('setDefaultResponseTransformer', () => {
    test('should change the default response transformer', async () => {
      const customTransformer = jest.fn().mockResolvedValue({ transformed: 'data' });
      Http.setDefaultResponseTransformer(customTransformer);

      const result = await Http.request('https://example.com');
      expect(result).toEqual({ transformed: 'data' });
      expect(customTransformer).toHaveBeenCalled();
      Http.setDefaultResponseTransformer((res) => res.text());
    });
  });

  describe('setDefaultUserAgent', () => {
    test('should change the default user agent', async () => {
      Http.setDefaultUserAgent('Custom-Agent/1.0');

      await Http.request('https://example.com');
      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.headers.get('user-agent')).toBe('Custom-Agent/1.0');
    });
  });

  describe('RequestError', () => {
    test('should create RequestError with correct properties', () => {
      const request = new Request('https://example.com');
      const response = new Response('error body', { status: 400 });
      const error = new RequestError('Test error', request, response);

      expect(error.message).toBe('Test error');
      expect(error.request).toBe(request);
      expect(error.response).toBe(response);
      expect(error.name).toBe('RequestError');
    });

    test('should create RequestError without response', () => {
      const request = new Request('https://example.com');
      const error = new RequestError('Test error', request);

      expect(error.message).toBe('Test error');
      expect(error.request).toBe(request);
      expect(error.response).toBeUndefined();
    });
  });

  describe('HttpClient', () => {
    let httpClient: HttpClient;

    beforeEach(() => {
      httpClient = new HttpClient();
    });

    test('should create HttpClient with cookie jar', () => {
      expect(httpClient.cookieJar).toBeInstanceOf(CookieJar);
    });

    test('should make request with cookies', async () => {
      // Set a cookie in the jar
      const cookie = Cookie.parse('name=value');
      if (cookie) {
        httpClient.cookieJar.setCookieSync(cookie, 'https://example.com');
      }

      await httpClient.request('https://example.com');

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.headers.get('cookie')).toBe('name=value');
    });

    test('should merge cookies with manually set cookies', async () => {
      // Set a cookie in the jar
      const cookie = Cookie.parse('jar_cookie=jar_value');
      if (cookie) {
        httpClient.cookieJar.setCookieSync(cookie, 'https://example.com');
      }

      // Make request with manual cookie
      await httpClient.request(new URL('https://example.com'), {
        headers: { cookie: 'manual_cookie=manual_value' }
      });

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      const cookieHeader = calledRequest.headers.get('cookie');
      expect(cookieHeader).toContain('jar_cookie=jar_value');
      expect(cookieHeader).toContain('manual_cookie=manual_value');
    });

    test('should handle Set-Cookie header in response', async () => {
      // 创建带 Set-Cookie 头的响应
      const headersWithSetCookie = new Headers();
      headersWithSetCookie.append('set-cookie', 'session_id=abc123; Path=/');

      const responseWithCookies = createMockResponse({
        headers: headersWithSetCookie
      });
      mockFetch.mockResolvedValueOnce(responseWithCookies);

      await httpClient.request('https://example.com');

      // Check that cookie was added to jar
      const cookies = httpClient.cookieJar.getCookiesSync('https://example.com');
      expect(cookies).toHaveLength(1);
      expect(cookies[0].key).toBe('session_id');
      expect(cookies[0].value).toBe('abc123');
    });

    test('should handle Set-Cookie header when RequestError occurs', async () => {
      // 创建带 Set-Cookie 头的错误响应
      const headersWithErrorCookie = new Headers();
      headersWithErrorCookie.append('set-cookie', 'error_session=error123; Path=/');

      const errorResponseWithCookies = createMockResponse({
        ok: false,
        status: 500,
        headers: headersWithErrorCookie
      });
      mockFetch.mockResolvedValueOnce(errorResponseWithCookies);

      await expect(httpClient.request('https://example.com'))
        .rejects
        .toThrow(RequestError);

      // Check that cookie was still added to jar
      const cookies = httpClient.cookieJar.getCookiesSync('https://example.com');
      expect(cookies).toHaveLength(1);
      expect(cookies[0].key).toBe('error_session');
      expect(cookies[0].value).toBe('error123');
    });

    test('get method should make GET request', async () => {
      const result = await httpClient.get('https://example.com');
      expect(result).toBe('response text');

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.method).toBe('GET');
    });

    test('post method should make POST request', async () => {
      await httpClient.post('https://example.com');
      expect(mockFetch).toHaveBeenCalled();

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.method).toBe('POST');
    });
  });

  describe('createRequest function', () => {
    // Since createRequest is not exported, we test it indirectly through other functions

    test('should handle URL objects correctly', async () => {
      const url = new URL('https://example.com/path');
      await Http.request(url);

      expect(mockFetch).toHaveBeenCalled();
      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.url).toBe('https://example.com/path');
    });
  });

  describe('globalOptions', () => {
    test('should apply global options to requests', async () => {
      // Set a global option
      Http.globalOptions.headers = { 'X-Global': 'value' };

      await Http.request('https://example.com');

      const calledRequest = mockFetch.mock.calls[0][0] as unknown as Request;
      expect(calledRequest.headers.get('X-Global')).toBe('value');

      // Reset global options
      Http.globalOptions.headers = {};
    });
  });
});
