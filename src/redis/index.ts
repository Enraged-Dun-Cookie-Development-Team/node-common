import { createClient } from '@redis/client';
import { ErrorReply, RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';

export interface RedisConfig {
  /**
   * redis密码
   */
  password?: string | undefined;
  /**
   * redis连接host
   */
  host?: string | undefined;
  /**
   * redis连接端口
   */
  port?: number | undefined;
  /**
   * redis连接数据库表
   */
  db?: number | undefined;
}

/**
 * 连接redis
 *
 * @returns redis客户端
 */
export function connectRedis(redisConfig: RedisConfig): Promise<RedisClientType<RedisModules, RedisFunctions, RedisScripts>> {
  return new Promise((resolve, reject) => {
    const { password, host = '127.0.0.1', port = 6379, db = 5 } = redisConfig;
    let url = 'redis://';
    if (password) {
      url += `:${password}@`;
    }
    url += `${host}:${port}/${db}`;
    const client = createClient({ url: url });
    client.on('error', (err) => {
      if (err instanceof ErrorReply) {
        err = new Error(err.message);
      }
      reject(err);
    });
    void client.connect().then(() => resolve(client));
  });
}

/**
 * 替redis处理错误类型
 *
 * @returns 包装好的错误
 */
export function castRedisError(err: unknown): Error {
  if (err instanceof ErrorReply) {
    return new Error(err.message);
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error(String(err));
}
