import { validator as openApiValidator } from "hono-openapi";
import type { z } from "zod";

export function validator<T extends z.ZodType>(
  target: "json" | "query" | "form" | "param",
  schema: T
) {
  // Library ini otomatis mendeteksi schema Zod kamu
  return openApiValidator(target, schema);
}
