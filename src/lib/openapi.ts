import { apiReference as Scalar } from "@scalar/hono-api-reference";
import type { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { env } from "hono/adapter";
import type { AppEnv, HonoEnv } from "./env";
import { Constants } from "./constants";

const {
  app: { NAME, VERSION },
} = Constants;

export function setupOpenAPI(app: Hono<HonoEnv>) {
  app.get("/openapi.json", (c, next) => {
    const appEnv = env<AppEnv>(c);
    const documentation = {
      info: {
        title: NAME,
        version: VERSION,
        description: "API documentation for Telegram API",
      },
      servers: [
        {
          url: `http://localhost:${appEnv.API_BASE_PORT}`,
          description: "Local server",
        },
        {
          url: appEnv.API_BASE_URL || "http://localhost:5000",
          description: "Environment server",
        },
      ],
      components: {
        securitySchemes: {
          ServiceAuth: {
            type: "apiKey" as const,
            in: "header" as const,
            name: "X-Service-Name",
            description:
              "Service name untuk authentication. Harus diisi di semua request.",
          },
          ServiceToken: {
            type: "apiKey" as const,
            in: "header" as const,
            name: "X-Service-Token",
            description:
              "Service token untuk authentication. Harus diisi di semua request.",
          },
        },
      },
      security: [
        {
          ServiceAuth: [],
          ServiceToken: [],
        },
      ],
    };
    const handler = openAPIRouteHandler(app as any, { documentation });
    return handler(c as any, next);
  });

  app.get(
    "/docs",
    Scalar({
      spec: { url: "/openapi.json" },
      metaData: {
        title: `${NAME} - API Documentation`,
      },
    }),
  );
}
