// @ts-nocheck
import { describe, it, expect } from 'vitest'
import { parseStateKeys } from './parsers.js'

describe('parseStateKeys', () => {
  it('should parse state keys from function declarations', () => {
    const a = `export function state () {
      return {
        user: {
          authenticated: false,
        },
        todoList: null,
      }
    }`
    expect(parseStateKeys(a)).toEqual(['user', 'todoList'])

    const b = `export const state = () => ({
      user: {
        authenticated: false,
      },
      todoList: null,
    })
    if (1) {
      const state = () => {

      }
    }
    `
    expect(parseStateKeys(b)).toEqual(['user', 'todoList'])
  })
})
