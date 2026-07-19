import type { Plugin } from 'vite'
import { describe, expectTypeOf, it } from 'vitest'
import viteReactify, { findCommonPath, type ViteReactifyPluginOptions } from './plugin.js'
describe('plugin types', () => {

  it('viteReactify returns a Vite Plugin', () => {
    expectTypeOf(viteReactify()).toExtend<Plugin>()
    expectTypeOf(viteReactify({})).toExtend<Plugin>()
    expectTypeOf(viteReactify({ spa: true })).toExtend<Plugin>()
    expectTypeOf(viteReactify({ clientModule: './client.js' })).toExtend<Plugin>()
    expectTypeOf(viteReactify({ spa: false, clientModule: './client.js' })).toExtend<Plugin>()
  })

  it('findCommonPath accepts string array and returns string', () => {
    expectTypeOf(findCommonPath).parameter(0).toEqualTypeOf<string[]>()
    expectTypeOf(findCommonPath(['a', 'b'])).toEqualTypeOf<string>()
  })

  it('ViteReactifyPluginOptions has correct shape', () => {
    const options: ViteReactifyPluginOptions = {}
    expectTypeOf(options.spa).toEqualTypeOf<boolean | undefined>()
    expectTypeOf(options.clientModule).toEqualTypeOf<string | undefined>()
  })
})
