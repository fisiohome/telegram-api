import type { Context, MiddlewareHandler, Next } from "hono";
import { forbiddenResponse, unauthorizedResponse } from "@/response";
import { logger } from "@/lib/logger";
import type { KyselyDatabase } from "@/lib/db";
import type { ServiceCredentials } from "@/db/schema";
import { env, isDevelopment } from "@/lib/env";

// Context keys for service authentication
export const SERVICE_AUTHENTICATED_KEY = "service_authenticated"; // true if authenticated
export const SERVICE_NAME_KEY = "service_name"; // service name
export const SERVICE_TYPE_KEY = "service_type"; // 'internal' or 'external'
export const SERVICE_CLIENT_ID_KEY = "service_client_id"; // client_id for external services

export type ServiceType = "internal" | "external";

// Selected service type from database (avoiding Kysely's ColumnType complexity)
type SelectedService = {
  id: string;
  service_name: string;
  service_token: string;
  service_type: string;
  is_active: boolean;
  client_id: string | null;
  client_name: string | null;
};

/**
 * ServiceAuthMiddleware validates service-to-service authentication
 * Supports both:
 *   - Internal services (bypass all auth): dashboard, monitoring, cron jobs
 *   - External SaaS clients (API access): third-party integrations with client_id context
 *
 * This middleware should be placed BEFORE AuthMiddleware to allow bypassing user authentication
 *
 * Headers required:
 *   - X-Service-Name: service name (e.g., "telegram-service" or "client-acme")
 *   - X-Service-Token: service token
 *
 * For internal services:
 *   - Sets c.set("service_authenticated", true)
 *   - AuthMiddleware will skip user token validation
 *
 * For external services:
 *   - Sets c.set("service_authenticated", true)
 *   - Sets c.set("service_client_id", clientID)
 *   - Can be used for multi-tenant isolation
 */
export function serviceAuthMiddleware(db: KyselyDatabase): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const component = "ServiceAuthMiddleware";
    const log = c.get("log") || logger;

    // Get headers
    const serviceName = c.req.header("X-Service-Name");
    const serviceToken = c.req.header("X-Service-Token");

    // If headers not present, skip and let other middleware handle it
    if (!serviceName || !serviceToken) {
      return next();
    }

    log.info(
      `${component}: Service authentication attempt | Service=${serviceName}`
    );

    // Validate the service credentials and get service object
    const service = await validateAndGetService(
      db,
      serviceName,
      serviceToken,
      log
    );

    if (!service) {
      log.warn(
        `${component}: Invalid service credentials | Service=${serviceName}`
      );
      return unauthorizedResponse(c, null, "Invalid service credentials");
    }

    // Update last used timestamp (async, don't block request)
    updateServiceLastUsed(db, serviceName, log).catch((err) => {
      log.error(
        `${component}: Failed to update last_used_at | Service=${serviceName}`,
        err
      );
    });

    log.info(
      `${component}: Service authenticated successfully | Service=${serviceName} | Type=${service.service_type}`
    );

    // Set flags in context
    c.set(SERVICE_AUTHENTICATED_KEY, true);
    c.set(SERVICE_NAME_KEY, serviceName);
    c.set(SERVICE_TYPE_KEY, service.service_type as ServiceType);

    // For external services, also store client_id
    if (service.service_type === "external" && service.client_id) {
      c.set(SERVICE_CLIENT_ID_KEY, service.client_id);
      log.info(
        `${component}: External client authenticated | ClientID=${service.client_id}`
      );
    }

    await next();
  };
}

/**
 * validateAndGetService checks if the service credentials are valid and returns the service
 * First checks database, then falls back to env var (for dev/staging)
 * Returns the service object if valid, null if invalid
 */
async function validateAndGetService(
  db: KyselyDatabase,
  serviceName: string,
  token: string,
  log: any
): Promise<SelectedService | null> {
  const component = "validateAndGetService";

  // Normalize service name
  const normalizedServiceName = serviceName.trim().toLowerCase();
  const normalizedToken = token.trim();

  if (!normalizedServiceName || !normalizedToken) {
    return null;
  }

  try {
    // Try database lookup first (for production/SaaS)
    const service = await db
      .selectFrom("service_credentials")
      .select([
        "id",
        "service_name",
        "service_token",
        "service_type",
        "is_active",
        "client_id",
        "client_name",
      ])
      .where("service_name", "=", normalizedServiceName)
      .where("service_token", "=", normalizedToken)
      .where("is_active", "=", true)
      .executeTakeFirst();

    if (service) {
      log.info(
        `${component}: Service validated from database | Service=${normalizedServiceName} | Type=${service.service_type}`
      );
      return service;
    }

    // Not found in database, try environment variable fallback (dev/staging only)
    if (!isDevelopment()) {
      // In production, only use database
      log.warn(
        `${component}: Service not found in database (production mode) | Service=${normalizedServiceName}`
      );
      return null;
    }

    // Dev/staging: check environment variable
    const envToken = env.SERVICE_AUTH_TOKEN;
    if (envToken && normalizedToken === envToken) {
      log.info(
        `${component}: Service validated from environment | Service=${normalizedServiceName} (dev mode)`
      );

      // Return a mock internal service object
      return {
        id: "dev-service",
        service_name: normalizedServiceName,
        service_token: normalizedToken,
        service_type: "internal",
        is_active: true,
        client_id: null,
        client_name: null,
      };
    }

    log.warn(
      `${component}: Service validation failed | Service=${normalizedServiceName}`
    );
    return null;
  } catch (error) {
    log.error(`${component}: Database error validating service`, error);
    return null;
  }
}

/**
 * updateServiceLastUsed updates the last_used_at timestamp
 */
async function updateServiceLastUsed(
  db: KyselyDatabase,
  serviceName: string,
  log: any
): Promise<void> {
  try {
    await db
      .updateTable("service_credentials")
      .set({ last_used_at: new Date() })
      .where("service_name", "=", serviceName)
      .execute();
  } catch (error) {
    // Log but don't throw - this is a background operation
    log.error(
      `updateServiceLastUsed: Failed to update | Service=${serviceName}`,
      error
    );
  }
}

/**
 * RequireService is a middleware that ensures the request is from an authenticated service
 * Use this on endpoints that should ONLY be accessible by services (internal or external)
 */
export function requireService(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const component = "RequireService";
    const log = c.get("log") || logger;

    const authenticated = c.get(SERVICE_AUTHENTICATED_KEY);

    if (authenticated !== true) {
      log.warn(
        `${component}: Access denied: not an authenticated service | Path=${c.req.path}`
      );
      return forbiddenResponse(
        c,
        null,
        "This endpoint is only accessible by authenticated services"
      );
    }

    await next();
  };
}

/**
 * RequireInternalService ensures request is from internal service only (not external clients)
 */
export function requireInternalService(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const component = "RequireInternalService";
    const log = c.get("log") || logger;

    const authenticated = c.get(SERVICE_AUTHENTICATED_KEY);
    const serviceType = c.get(SERVICE_TYPE_KEY);

    if (authenticated !== true || serviceType !== "internal") {
      log.warn(
        `${component}: Access denied: not an internal service | Path=${c.req.path}`
      );
      return forbiddenResponse(
        c,
        null,
        "This endpoint is only accessible by internal services"
      );
    }

    await next();
  };
}
