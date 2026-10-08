import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const expected = ['answers', 'favorites', 'search_cache', 'search_logs']
const rows = await sql.query(
  `select table_name from information_schema.tables where table_schema = 'public'`
)
const actual = rows.map((r) => r.table_name)
const missing = expected.filter((t) => !actual.includes(t))
if (missing.length > 0) {
  console.error('缺少表:', missing)
  process.exit(1)
}
console.log('schema OK:', actual.join(', '))
