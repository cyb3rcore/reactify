import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

export function parseStateKeys(code: string) {
  const ast = acorn.parse(code, { sourceType: 'module', ecmaVersion: 2020 })

  let objectKeys: string[] = []

  walk.simple(ast, {
    ExportNamedDeclaration(node) {
      if (!node.declaration) return

      if (node.declaration.type === 'FunctionDeclaration') {
        const fnDecl = node.declaration as acorn.FunctionDeclaration
        for (const subNode of fnDecl.body.body) {
          if (
            subNode.type === 'ReturnStatement' &&
            subNode.argument &&
            subNode.argument.type === 'ObjectExpression'
          ) {
            objectKeys = extractObjectKeys(subNode.argument)
          }
        }
      } else if (node.declaration.type === 'VariableDeclaration') {
        const varDecl = node.declaration as acorn.VariableDeclaration
        for (const subNode of varDecl.declarations) {
          if (
            subNode.type === 'VariableDeclarator' &&
            subNode.init &&
            subNode.init.type === 'ArrowFunctionExpression' &&
            subNode.init.body.type === 'ObjectExpression'
          ) {
            objectKeys = extractObjectKeys(subNode.init.body)
          }
        }
      }
    },
  })

  return objectKeys
}

function extractObjectKeys(node: acorn.ObjectExpression) {
  const keys: string[] = []
  for (const prop of node.properties) {
    if (prop.type === 'Property' && prop.key && prop.key.type === 'Identifier') {
      keys.push(prop.key.name)
    }
  }
  return keys
}
