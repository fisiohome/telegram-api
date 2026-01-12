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

  // Setup OpenAPI documentation
  setupOpenAPI(app);

  // Register API routes
  registerRoutes(app);

  return app;
}
