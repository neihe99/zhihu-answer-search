import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)
const ddl = readFileSync(new URL('../src/lib/schema.sql', import.meta.url), 'utf8')
await sql.query(ddl)
console.log('schema applied')
