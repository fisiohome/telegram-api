import { serve } from '@hono/node-server'
import consola from 'consola'
import { colors } from 'consola/utils'
import { buildApp } from './app'
import { env } from './lib/env'
import { closeDatabase, initializeDatabase } from './lib/db-init'

const port = env.API_BASE_PORT;

(async () => {
  try {
    // Initialize database (read-only)
    await initializeDatabase(consola)

    // Build Hono app
    const app = await buildApp()

    // Start server
    const server = serve(
      {
        fetch: app.fetch,
        port,
      },
      (info) => {
        consola.box(
          `${colors.bold(colors.cyan('Telegram API'))} (Powered by Hono 🔥)`,
          `\n- ${'API: '.padEnd(7)} ${colors.underline(colors.green(`http://localhost:${info.port}`))}`,
          `\n- ${'Docs: '.padEnd(7)} ${colors.underline(colors.green(`http://localhost:${info.port}/docs`))}`,
          `\n- ${'Health: '.padEnd(7)} ${colors.underline(colors.green(`http://localhost:${info.port}/health`))}`
        )
      }
    )

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      consola.warn(`Received signal to terminate: ${signal}`)
      
      try {
        // Close server
        server.close()
        consola.info('Server closed')

        // Close database connection
        await closeDatabase(consola)

        consola.success('Graceful shutdown completed')
        process.exit(0)
      } catch (error) {
        consola.error('Error during shutdown:', error)
        process.exit(1)
      }
    }

    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      consola.error('Uncaught exception:', error)
      shutdown('uncaughtException')
    })

    process.on('unhandledRejection', (reason, promise) => {
      consola.error('Unhandled rejection at:', promise, 'reason:', reason)
      shutdown('unhandledRejection')
    })
  } catch (error) {
    consola.error('Failed to start server:', error)
    process.exit(1)
  }
})()
