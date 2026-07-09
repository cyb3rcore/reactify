// Custom Node.js ESM loader to intercept 'virtual:' protocol URLs
// and redirect them to mock modules. Also mocks @vitejs/plugin-rsc/* modules
// that have incompatible CJS/Webpack dependencies.

const mockModules = {
  'virtual:vite-rsc/client-references': 'export default {}',
  'virtual:vite-rsc/assets-manifest': 'export default {}',
  'virtual:vite-rsc/server-references': 'export default {}',
  'virtual:vite-rsc/encryption-key': 'export default "mock-encryption-key"',
}

const pluginRscMockCode = `export async function createFromFetch() {}
export async function createFromReadableStream() {}
export function createServerReference() { return () => {} }
export function createTemporaryReferenceSet() { return { reference: () => {} } }
export async function encodeReply() { return new ArrayBuffer(0) }
export function findSourceMapURL() { return undefined }
export function setServerCallback() {}
export function callServer() {}
export function setRequireModule() {}
export async function decodeReply() { return {} }
export async function loadServerAction() { return {} }
export async function decodeAction() { return {} }
export async function decodeFormState() { return {} }
export async function renderToReadableStream() { return new ReadableStream() }`

export function resolve(specifier, context, nextResolve) {
  // Mock virtual: protocol URLs
  if (specifier.startsWith('virtual:')) {
    const encoded = encodeURIComponent(specifier)
    return {
      url: `file:///virtual-mock/${encoded}.js`,
      shortCircuit: true,
    }
  }
  
  // Mock all @vitejs/plugin-rsc bare specifier imports
  if (specifier.startsWith('@vitejs/plugin-rsc')) {
    const name = specifier.replace('@vitejs/plugin-rsc/', '').replace(/[^a-z0-9]/gi, '-')
    return {
      url: `file:///virtual-mock/rsc-${name}.js`,
      shortCircuit: true,
    }
  }
  
  return nextResolve(specifier, context)
}

export function load(url, context, nextLoad) {
  // Intercept file loads from @vitejs/plugin-rsc package
  if (url.includes('@vitejs/plugin-rsc')) {
    const subpath = url.split('@vitejs/plugin-rsc/dist/')[1]?.replace(/\.js$/, '') || 'index'
    return {
      format: 'module',
      source: pluginRscMockCode,
      shortCircuit: true,
    }
  }
  
  if (url.startsWith('file:///virtual-mock/')) {
    const path = url.replace('file:///virtual-mock/', '').replace('.js', '')
    const decoded = decodeURIComponent(path)
    
    // Handle @vitejs/plugin-rsc subpath mocks
    if (path.startsWith('rsc-')) {
      return {
        format: 'module',
        source: pluginRscMockCode,
        shortCircuit: true,
      }
    }
    
    // Handle virtual: protocol mocks
    const code = mockModules[decoded] || 'export default {}'
    return {
      format: 'module',
      source: code,
      shortCircuit: true,
    }
  }
  
  return nextLoad(url, context)
}
