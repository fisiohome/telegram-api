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

  // Health check endpoint
  app.get("/health", (c) =>
    c.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      name: APP_NAME,
      version: APP_VERSION,
    })
  );

  // Setup OpenAPI documentation
  setupOpenAPI(app);

  // Register API routes
  registerRoutes(app);

  return app;
}
