import { describe, expect, it } from 'vitest'
import { isCronAuthorized } from '@/lib/auth'

describe('isCronAuthorized', () => {
  it('Bearer 与 secret 匹配才通过', () => {
    expect(isCronAuthorized('Bearer abc123', 'abc123')).toBe(true)
    expect(isCronAuthorized('Bearer wrong', 'abc123')).toBe(false)
  })
  it('缺失/不匹配一律拒绝，secret 未配置时拒绝一切', () => {
    expect(isCronAuthorized(null, 'abc123')).toBe(false)
    expect(isCronAuthorized('Bearer abc123', undefined)).toBe(false)
  })
})
