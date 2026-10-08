import { describe, expect, it } from 'vitest'
import { isValidQuery, normalizeQuery, queryHash } from '@/lib/query'

describe('normalizeQuery', () => {
  it('去首尾空白、折叠内部空白、转小写', () => {
    expect(normalizeQuery('  RAG   评测 方法 ')).toBe('rag 评测 方法')
  })
  it('空串与纯空白归一化为空', () => {
    expect(normalizeQuery('   ')).toBe('')
  })
})

describe('isValidQuery', () => {
  it('非空查询有效', () => expect(isValidQuery('RAG')).toBe(true))
  it('纯空白无效', () => expect(isValidQuery('   ')).toBe(false))
})

describe('queryHash', () => {
  it('同一查询（忽略大小写空白）哈希相同', () => {
    expect(queryHash(' RAG 评测')).toBe(queryHash('rag 评测 '))
  })
  it('不同查询哈希不同', () => {
    expect(queryHash('rag')).not.toBe(queryHash('agent'))
  })
})
