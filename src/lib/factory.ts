import { createFactory } from 'hono/factory'
import { type DescripeOpts, describe } from '@/middleware/describe'
import type { HonoEnv } from './env'

export const createTaggedFactory = (tag: string) => {
  return [
    createFactory<HonoEnv>({
      initApp(app) {
        app.use(async (c, next) => {
          const log = c.get('log')
          if (log) {
            c.set('log', log.withTag(tag))
          }
          await next()
        })
      },
    }),
    (opts: Omit<DescripeOpts, 'tag'>) => describe({ tag, ...opts }),
  ] as const
}
