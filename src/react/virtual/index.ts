import { createRoutes } from '../server.js'

export default {
  routes: createRoutes(import('$app/routes.js')),
  create: import('$app/create.jsx'),
  context: import('$app/context.js'),
}
