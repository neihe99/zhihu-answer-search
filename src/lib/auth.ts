export function isAuthorized(authHeader: string | null, password: string | undefined): boolean {
  if (!password) return false
  if (!authHeader?.startsWith('Basic ')) return false
  const decoded = atob(authHeader.slice('Basic '.length))
  const sep = decoded.indexOf(':')
  if (sep < 0) return false
  return decoded.slice(sep + 1) === password
}

export function isCronAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false
  return authHeader === `Bearer ${secret}`
}
