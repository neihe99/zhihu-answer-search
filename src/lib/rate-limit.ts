export function createThrottler(minIntervalMs: number): () => Promise<void> {
  let lastCallAt = 0
  return async function throttle(): Promise<void> {
    const now = Date.now()
    const wait = lastCallAt + minIntervalMs - now
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastCallAt = Date.now()
  }
}

// 知乎 API 全局限流：每秒最多 1 次
export const throttleZhihu = createThrottler(1000)
