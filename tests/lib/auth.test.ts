import { describe, expect, it } from 'vitest'
import { isAuthorized } from '@/lib/auth'

function basic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

describe('isAuthorized', () => {
  it('接受正确密码', () => {
    expect(isAuthorized(basic('admin', 'secret123'), 'secret123')).toBe(true)
  })
  it('拒绝错误密码', () => {
    expect(isAuthorized(basic('admin', 'wrong'), 'secret123')).toBe(false)
  })
  it('拒绝缺失/非 Basic 的 header', () => {
    expect(isAuthorized(null, 'secret123')).toBe(false)
    expect(isAuthorized('Bearer abc', 'secret123')).toBe(false)
  })
  it('密码未配置时拒绝一切（fail closed）', () => {
    expect(isAuthorized(basic('admin', 'secret123'), undefined)).toBe(false)
    expect(isAuthorized(basic('admin', ''), '')).toBe(false)
  })
})
