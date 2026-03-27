/**
 * Redis connection settings for BullMQ (shared with queue, worker, and optional locks).
 * Mirrors the pattern used in the reference `redisClient.ts` at the repo root.
 */
export type RedisConfig = {
  host: string;
  port: number;
  password?: string;
};

export function getRedisConfig(): RedisConfig {
  const host = process.env.REDIS_HOST ?? "127.0.0.1";
  const port = Number(process.env.REDIS_PORT ?? 6379);
  const password = process.env.REDIS_PASSWORD;

  // Redis config resolved (logged via logger at startup)

  return {
    host,
    port,
    ...(password ? { password } : {}),
  };
}
