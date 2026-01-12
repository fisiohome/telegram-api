import { consola } from "consola";
import Redis from "ioredis";
import { env } from "./env";

let redis: Redis | null = null;

export async function initializeRedis() {
  if (env.REDIS_DISABLED) {
    consola.info("Redis is disabled");
    return null;
  }

  if (redis) {
    return redis;
  }

  try {
    // Parse host and port from REDIS_HOST (e.g., "localhost:6379")
    const [host, portStr] = env.REDIS_HOST.split(":");
    const port = portStr ? parseInt(portStr, 10) : 6379;

    redis = new Redis({
      host: host || "localhost",
      port,
      username: env.REDIS_USER || undefined,
      password: env.REDIS_AUTH || undefined,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      consola.error("Redis error:", err);
    });

    redis.on("connect", () => {
      consola.success("Redis connected");
    });

    await redis.connect();

    return redis;
  } catch (error) {
    consola.error("Failed to initialize Redis:", error);
    throw error;
  }
}

export function getRedis(): Redis | null {
  return redis;
}

export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
    consola.info("Redis connection closed");
  }
}
