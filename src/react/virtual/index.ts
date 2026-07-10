import { createRoutes } from '../server.js'

export default {
  routes: createRoutes(import('$app/routes.js')),
  create: import('$app/create.js'),
  context: import('$app/context.js'),
}
