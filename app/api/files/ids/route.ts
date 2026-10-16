import { sql } from '@/lib/db';

export async function GET() {
  const rows = await sql`SELECT id, file_id FROM files ORDER BY id`;
  return Response.json(rows);
}
