import { sql } from '@/lib/db';

export async function GET() {
  const groups = (await sql`
    SELECT size_bytes, COUNT(*)::int AS count, array_agg(id) AS ids
    FROM files
    GROUP BY size_bytes
    HAVING COUNT(*) > 1
    ORDER BY size_bytes DESC
    LIMIT 100
  `) as any[];

  const result = [];
  for (const g of groups) {
    const files = await sql`
      SELECT id, filename, mime_type, size_bytes, telegram_date
      FROM files
      WHERE id = ANY(${g.ids})
      ORDER BY filename
    `;
    result.push({ size_bytes: g.size_bytes, count: g.count, files });
  }
  return Response.json(result);
}
