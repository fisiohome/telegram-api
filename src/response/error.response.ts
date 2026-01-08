import type { Context } from 'hono'
import { ReasonPhrases, StatusCodes } from 'http-status-codes'
import { z } from 'zod'

export const errorSchema = z.object({
  status: z.number(),
  message: z.string(),
  data: z.null(),
  error: z.any(),
  request_id: z.string(),
  timestamp: z.number(),
})

export interface ErrorResponse {
  status: number
  message: string
  data: null
  error: any
  request_id: string
  timestamp: number
}

function getRequestId(c: Context): string {
  return (c.get('requestId') as string | undefined) || crypto.randomUUID()
}

export function badRequestResponse(c: Context, error: any, message?: string): Response {
  return c.json(
    {
      status: StatusCodes.BAD_REQUEST,
      data: null,
      error,
      message: message || ReasonPhrases.BAD_REQUEST,
      request_id: getRequestId(c),
      timestamp: Date.now(),
    } as ErrorResponse,
    StatusCodes.BAD_REQUEST
  )
}

export function unauthorizedResponse(c: Context, error?: any, message?: string): Response {
  return c.json(
    {
      status: StatusCodes.UNAUTHORIZED,
      data: null,
      error: error || null,
      message: message || ReasonPhrases.UNAUTHORIZED,
      request_id: getRequestId(c),
      timestamp: Date.now(),
    } as ErrorResponse,
    StatusCodes.UNAUTHORIZED
  )
}

export function forbiddenResponse(c: Context, error?: any, message?: string): Response {
  return c.json(
    {
      status: StatusCodes.FORBIDDEN,
      data: null,
      error: error || null,
      message: message || ReasonPhrases.FORBIDDEN,
      request_id: getRequestId(c),
      timestamp: Date.now(),
    } as ErrorResponse,
    StatusCodes.FORBIDDEN
  )
}

export function notFoundResponse(c: Context, error?: any, message?: string): Response {
  return c.json(
    {
      status: StatusCodes.NOT_FOUND,
      data: null,
      error: error || null,
      message: message || ReasonPhrases.NOT_FOUND,
      request_id: getRequestId(c),
      timestamp: Date.now(),
    } as ErrorResponse,
    StatusCodes.NOT_FOUND
  )
}

export function internalServerErrorResponse(c: Context, error: any, message?: string): Response {
  return c.json(
    {
      status: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      error,
      message: message || ReasonPhrases.INTERNAL_SERVER_ERROR,
      request_id: getRequestId(c),
      timestamp: Date.now(),
    } as ErrorResponse,
    StatusCodes.INTERNAL_SERVER_ERROR
  )
}
