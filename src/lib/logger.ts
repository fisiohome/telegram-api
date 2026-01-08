import consola from 'consola'

export const logger = consola.create({
  level: process.env.LOG_LEVEL ? Number(process.env.LOG_LEVEL) : 3,
})

export default logger
