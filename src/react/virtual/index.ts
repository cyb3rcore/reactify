import { createRoutes } from 'reactify/server'

export default {
  routes: createRoutes(import('$app/routes.js')),
  create: import('$app/create.js'),
  context: import('$app/context.js'),
}
