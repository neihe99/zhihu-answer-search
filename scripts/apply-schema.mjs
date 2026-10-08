import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const ddl = readFileSync(new URL('../src/lib/schema.sql', import.meta.url), 'utf8')
const statements = ddl.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)
for (const stmt of statements) {
  await sql.query(stmt)
}
console.log('schema applied:', statements.length, 'statements')
