import { describe, expect, it } from 'vitest'
import { createThrottler } from '@/lib/rate-limit'

describe('createThrottler', () => {
  it('两次调用间隔不小于 minIntervalMs', async () => {
    const throttle = createThrottler(50)
    const start = Date.now()
    await throttle()
    await throttle()
    expect(Date.now() - start).toBeGreaterThanOrEqual(45)
  })
  it('首次调用不等待', async () => {
    const throttle = createThrottler(10_000)
    const start = Date.now()
    await throttle()
    expect(Date.now() - start).toBeLessThan(100)
  })
})
