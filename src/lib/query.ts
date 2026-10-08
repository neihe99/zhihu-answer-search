import { createHash } from 'node:crypto'

export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function isValidQuery(raw: string): boolean {
  return normalizeQuery(raw).length > 0
}

export function queryHash(raw: string): string {
  return createHash('sha256').update(normalizeQuery(raw)).digest('hex')
}
