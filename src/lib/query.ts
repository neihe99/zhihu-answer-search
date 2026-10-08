import { createHash } from 'node:crypto'

export function normalizeQuery(raw: string): string {
  // 注意：知乎搜索大小写敏感（RAG ≠ rag），不能转小写
  return raw.trim().replace(/\s+/g, ' ')
}

export function isValidQuery(raw: string): boolean {
  return normalizeQuery(raw).length > 0
}

export function queryHash(raw: string): string {
  return createHash('sha256').update(normalizeQuery(raw)).digest('hex')
}
