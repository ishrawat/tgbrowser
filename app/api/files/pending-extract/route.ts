import { sql } from '@/lib/db';

export async function GET() {
  const rows = await sql`
    SELECT id, filename, size_bytes
    FROM files
    WHERE mime_type = 'application/pdf'
      AND content_text IS NULL
      AND size_bytes < 20 * 1024 * 1024
    ORDER BY telegram_date DESC
  `;
  return Response.json(rows);
}
