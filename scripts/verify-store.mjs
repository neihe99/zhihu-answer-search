import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const hash = 'testhash' + Date.now()

await sql.query(
  `insert into search_cache (query_hash, query, results) values ($1, 'verify query', '[]')`, [hash])
const hit = await sql.query(
  `select results from search_cache where query_hash = $1 and created_at > now() - interval '1 hour'`, [hash])
console.assert(hit.length === 1, '缓存写入/读取失败')

await sql.query(`insert into search_logs (query, cache_hit, result_count) values ('verify query', true, 0)`)
const logs = await sql.query(`select query from search_logs where query = 'verify query'`)
console.assert(logs.length >= 1, '日志写入失败')

await sql.query(`insert into favorites (id, data) values ('verify-id', '{}') on conflict (id) do nothing`)
await sql.query(`delete from favorites where id = 'verify-id'`)

const hot = await sql.query(
  `select query, count(*)::int as count from search_logs group by query order by count desc limit 5`)
console.log('hotWords OK:', hot.length > 0)

await sql.query(`delete from search_cache where query_hash = $1`, [hash])
await sql.query(`delete from search_logs where query = 'verify query'`)
console.log('store verification OK')
