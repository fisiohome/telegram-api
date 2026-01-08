import type { Context } from "hono";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { z, ZodTypeAny } from "zod";

export const successSchema = <T extends ZodTypeAny>(data: T) =>
  z.object({
    status: z.number(),
    message: z.string(),
    data,
    error: z.null(),
    request_id: z.string(),
    timestamp: z.number(),
  });

export interface SuccessResponse<T> {
  status: number;
  message: string;
  data: T;
  error: null;
  request_id: string;
  timestamp: number;
}

function getRequestId(c: Context): string {
  return (c.get("requestId") as string | undefined) || crypto.randomUUID();
}

export function successResponse<T>(
  c: Context,
  data: T,
  message?: string
): Response {
  return c.json({
    status: StatusCodes.OK,
    data,
    error: null,
    message: message || ReasonPhrases.OK,
    request_id: getRequestId(c),
    timestamp: Date.now(),
  } as SuccessResponse<T>);
}

export function createdResponse<T>(
  c: Context,
  data: T,
  message?: string
): Response {
  return c.json(
    {
      status: StatusCodes.CREATED,
      data,
      error: null,
      message: message || ReasonPhrases.CREATED,
      request_id: getRequestId(c),
      timestamp: Date.now(),
    } as SuccessResponse<T>,
    StatusCodes.CREATED
  );
}
