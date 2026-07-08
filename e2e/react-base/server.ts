import Fastify from 'fastify'
import reactify from 'reactify'
import * as renderer from 'reactify/renderer'

export async function main(dev?: boolean) {
  const server = Fastify()
  await server.register(reactify, {
    root: import.meta.dirname,
    dev: dev ?? process.argv.includes('--dev'),
    renderer,
  })
  await server.vite.ready()
  return server
}

if (process.argv[1] === import.meta.filename) {
  const server = await main()
  await server.listen({ port: 3001 })
}
