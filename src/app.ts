import { createFactory } from "hono/factory";
import { cors } from "hono/cors";
import {
  requestLogger,
  errorHandler,
  serviceAuthMiddleware,
} from "@/middleware";
import { registerRoutes } from "@/routes";
import { API_PREFIX, APP_NAME, APP_VERSION, setupOpenAPI } from "@/lib";
import type { HonoEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getDB } from "@/lib/db-init";

export async function buildApp() {
  const factory = createFactory<HonoEnv>({
    initApp(app) {
      app.use(async (c, next) => {
        c.set("log", logger);
        await next();
      });
    },
  });

  const app = factory.createApp();

  // Global middleware
  app.use("*", cors());
  app.use("*", errorHandler);
  app.use("*", requestLogger);
  app.use("*", serviceAuthMiddleware(getDB())); // Service authentication (optional headers)

  // Basic health check endpoint (fast)
  app.get("/health", (c) =>
    c.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      name: APP_NAME,
      version: APP_VERSION,
    })
  );

  // Detailed health check endpoint (checks DB & Redis)
  app.get("/health/detailed", async (c) => {
    const healthStatus = {
      status: "OK" as "OK" | "DEGRADED" | "ERROR",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      name: APP_NAME,
      version: APP_VERSION,
      services: {
        database: {
          status: "OK" as "OK" | "ERROR",
          message: "",
          responseTime: 0,
        },
        redis: {
          status: "OK" as "OK" | "ERROR" | "DISABLED",
          message: "",
          responseTime: 0,
        },
      },
    };

    // Check Database
    try {
      const dbStart = Date.now();
      const db = getDB();
      await db.selectFrom("users").select("id").limit(1).execute();
      healthStatus.services.database.responseTime = Date.now() - dbStart;
      healthStatus.services.database.message = "Connected";
    } catch (error: any) {
      healthStatus.services.database.status = "ERROR";
      healthStatus.services.database.message = error.message || "Connection failed";
      healthStatus.status = "ERROR";
    }

    // Check Redis
    try {
      const redis = (await import("@/lib/redis")).getRedis();
      
      if (!redis) {
        healthStatus.services.redis.status = "DISABLED";
        healthStatus.services.redis.message = "Redis is disabled in configuration";
      } else {
        const redisStart = Date.now();
        await redis.ping();
        healthStatus.services.redis.responseTime = Date.now() - redisStart;
        healthStatus.services.redis.message = "Connected";
      }
    } catch (error: any) {
      healthStatus.services.redis.status = "ERROR";
      healthStatus.services.redis.message = error.message || "Connection failed";
      
      // Redis error is degraded, not full error (service can still work without cache)
      if (healthStatus.status === "OK") {
        healthStatus.status = "DEGRADED";
      }
    }

    // Return appropriate HTTP status code
    const httpStatus = healthStatus.status === "OK" ? 200 : healthStatus.status === "DEGRADED" ? 207 : 503;
    
    return c.json(healthStatus, httpStatus);
  });

  // TEMPORARY: Test Redis initialization endpoint with custom params
  app.get("/test/redis", async (c) => {
    const { env } = await import("@/lib/env");
    const { getRedis } = await import("@/lib/redis");
    const Redis = (await import("ioredis")).default;
    
    // Get custom params from query or use env defaults
    const customHost = c.req.query("host") || env.REDIS_HOST;
    const customUser = c.req.query("user") || env.REDIS_USER;
    const customAuth = c.req.query("auth") || env.REDIS_AUTH;
    const customDisabled = c.req.query("disabled") === "true" || env.REDIS_DISABLED;
    
    const testResult: any = {
      timestamp: new Date().toISOString(),
      testParams: {
        host: customHost,
        user: customUser,
        auth: customAuth ? "***SET***" : undefined,
        disabled: customDisabled,
      },
      envConfig: {
        REDIS_DISABLED: env.REDIS_DISABLED,
        REDIS_HOST: env.REDIS_HOST,
        REDIS_USER: env.REDIS_USER,
        REDIS_AUTH: env.REDIS_AUTH ? "***SET***" : undefined,
      },
      currentConnection: null,
      customConnectionTest: null,
    };

    // Check current Redis instance (from main initialization)
    const currentRedis = getRedis();
    if (currentRedis) {
      try {
        const start = Date.now();
        await currentRedis.ping();
        testResult.currentConnection = {
          status: "OK",
          message: "Connected and responsive",
          responseTime: Date.now() - start,
        };
      } catch (error: any) {
        testResult.currentConnection = {
          status: "ERROR",
          message: error.message,
        };
      }
    } else {
      testResult.currentConnection = {
        status: "NULL",
        message: "Redis instance is null (not initialized or disabled)",
      };
    }

    // Test with custom parameters (if not disabled)
    if (!customDisabled) {
      try {
        const [host, portStr] = customHost.split(":");
        const port = portStr ? parseInt(portStr, 10) : 6379;

        const testRedis = new Redis({
          host: host || "localhost",
          port,
          username: customUser || undefined,
          password: customAuth || undefined,
          lazyConnect: true,
          connectTimeout: 5000,
        });

        const start = Date.now();
        await testRedis.connect();
        await testRedis.ping();
        const responseTime = Date.now() - start;
        
        await testRedis.quit();

        testResult.customConnectionTest = {
          status: "SUCCESS",
          message: "Custom connection successful",
          responseTime,
          config: {
            host,
            port,
            hasAuth: !!customAuth,
            hasUser: !!customUser,
          },
        };
      } catch (error: any) {
        testResult.customConnectionTest = {
          status: "ERROR",
          message: error.message,
          stack: error.stack,
        };
      }
    } else {
      testResult.customConnectionTest = {
        status: "SKIPPED",
        message: "Test skipped because disabled=true",
      };
    }

    return c.json(testResult);
  });

  // Setup OpenAPI documentation
  setupOpenAPI(app);

  // Register API routes
  registerRoutes(app);

  return app;
}
