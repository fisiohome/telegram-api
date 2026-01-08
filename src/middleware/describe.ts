import { describeRoute, resolver } from "hono-openapi";
import { errorSchema } from "@/response";
import { successSchema } from "@/response";
import type { ZodTypeAny } from "zod";

export type DescripeOpts = {
  tag: string;
  description: string;
  schema: ZodTypeAny;
  requestBody?: ZodTypeAny;
  requestBodyContentType?: string;
  requireServiceAuth?: boolean; // Add flag for service authentication
};

export function describe({
  tag,
  description,
  schema,
  requestBody,
  requestBodyContentType = "multipart/form-data",
  requireServiceAuth = false,
}: DescripeOpts) {
  return describeRoute({
    description: description,
    tags: [tag],
    ...(requireServiceAuth && {
      security: [
        {
          ServiceAuth: [],
          ServiceToken: [],
        },
      ],
    }),
    ...(requestBody && {
      requestBody: {
        content: {
          [requestBodyContentType]: {
            schema: resolver(requestBody) as any,
          },
        },
      },
    }),
    responses: {
      200: {
        description: "Success",
        content: {
          "text/json": { schema: resolver(successSchema(schema)) },
        },
      },
      400: {
        description:
          "Bad Request - Invalid request data or business logic error",
        content: {
          "text/json": { schema: resolver(errorSchema) },
        },
      },
      401: {
        description:
          "Unauthorized - Authentication required or invalid credentials",
        content: {
          "text/json": { schema: resolver(errorSchema) },
        },
      },
      403: {
        description: "Forbidden - Insufficient permissions",
        content: {
          "text/json": { schema: resolver(errorSchema) },
        },
      },
      404: {
        description: "Not Found - Resource does not exist",
        content: {
          "text/json": { schema: resolver(errorSchema) },
        },
      },
      409: {
        description: "Conflict - Resource already exists or state conflict",
        content: {
          "text/json": { schema: resolver(errorSchema) },
        },
      },
      422: {
        description: "Unprocessable Entity - Validation error",
        content: {
          "text/json": { schema: resolver(errorSchema) },
        },
      },
      429: {
        description: "Too Many Requests - Rate limit exceeded",
        content: {
          "text/json": { schema: resolver(errorSchema) },
        },
      },
      500: {
        description: "Internal Server Error - Unexpected server error",
        content: {
          "text/json": { schema: resolver(errorSchema) },
        },
      },
    },
  });
}
