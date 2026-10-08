import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { GET, isAllowedImageUrl } from '@/app/api/image/route'

describe('isAllowedImageUrl', () => {
  it('放行 https 的 zhimg.com 域名', () => {
    expect(isAllowedImageUrl('https://pic1.zhimg.com/v2-abc.jpg')).toBe(true)
    expect(isAllowedImageUrl('https://picx.zhimg.com/a.png')).toBe(true)
  })
  it('拒绝非 zhimg 域名（防开放代理）', () => {
    expect(isAllowedImageUrl('https://example.com/x.jpg')).toBe(false)
    expect(isAllowedImageUrl('https://zhimg.com.evil.com/x.jpg')).toBe(false)
  })
  it('拒绝非 https 与非法 URL', () => {
    expect(isAllowedImageUrl('http://pic1.zhimg.com/x.jpg')).toBe(false)
    expect(isAllowedImageUrl('not-a-url')).toBe(false)
  })
})

describe('GET /api/image', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      body: 'fake-image-bytes',
    }) as unknown as Response))
  })
  afterEach(() => vi.unstubAllGlobals())

  function req(url: string): Request {
    return new Request(`http://localhost/api/image?url=${encodeURIComponent(url)}`)
  }

  it('非 zhimg URL 返回 403，不回源', async () => {
    const resp = await GET(req('https://example.com/x.jpg'))
    expect(resp.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('合法 URL 回源并透传 content-type', async () => {
    const resp = await GET(req('https://pic1.zhimg.com/v2-abc.jpg'))
    expect(resp.status).toBe(200)
    expect(resp.headers.get('content-type')).toBe('image/jpeg')
    expect(fetch).toHaveBeenCalledOnce()
  })
})
