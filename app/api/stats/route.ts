import { sql } from '@/lib/db';

export async function GET() {
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total_files,
      COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes,
      COALESCE(SUM(CASE WHEN mime_type LIKE 'image/%' THEN 1 ELSE 0 END), 0)::int AS images,
      COALESCE(SUM(CASE WHEN mime_type LIKE 'video/%' THEN 1 ELSE 0 END), 0)::int AS videos,
      COALESCE(SUM(CASE WHEN mime_type = 'application/pdf' THEN 1 ELSE 0 END), 0)::int AS pdfs,
      COALESCE(SUM(CASE WHEN starred THEN 1 ELSE 0 END), 0)::int AS starred
    FROM files
  `;
  return Response.json(rows[0]);
}
