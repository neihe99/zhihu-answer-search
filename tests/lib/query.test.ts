import { describe, expect, it } from 'vitest'
import { isValidQuery, normalizeQuery, queryHash } from '@/lib/query'

describe('normalizeQuery', () => {
  it('去首尾空白、折叠内部空白', () => {
    expect(normalizeQuery('  RAG   评测 方法 ')).toBe('RAG 评测 方法')
  })
  it('保留大小写（知乎搜索大小写敏感，RAG ≠ rag）', () => {
    expect(normalizeQuery('RAG')).toBe('RAG')
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
  it('同一查询（忽略首尾与多余空白）哈希相同', () => {
    expect(queryHash(' RAG 评测 ')).toBe(queryHash('RAG 评测'))
  })
  it('大小写不同视为不同查询（平台行为如此）', () => {
    expect(queryHash('RAG')).not.toBe(queryHash('rag'))
  })
  it('不同查询哈希不同', () => {
    expect(queryHash('rag')).not.toBe(queryHash('agent'))
  })
})
