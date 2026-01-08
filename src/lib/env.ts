import type { ConsolaInstance } from "consola";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  API_BASE_PORT: z.coerce.number().default(5000),
  API_BASE_URL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string(),
  DATABASE_URL: z.string(), // Added based on original file's content
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.coerce.number(),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string(),
  SERVICE_AUTH_TOKEN: z.string().optional(), // For dev/staging service auth fallback
  TELEGRAM_ADMIN : z.string().default("@y9597px"),
});

export type AppEnv = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

export type HonoEnv = {
  Variables: {
    log?: ConsolaInstance;
    requestId?: string;
    // Service authentication context
    service_authenticated?: boolean;
    service_name?: string;
    service_type?: "internal" | "external";
    service_client_id?: string;
  };
};

export function isDevelopment(): boolean {
  return env.NODE_ENV === "development";
}

export function isProduction(): boolean {
  return env.NODE_ENV === "production";
}
