import { sql } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT c.id, c.name, c.color
    FROM collections c
    INNER JOIN file_collections fc ON fc.collection_id = c.id
    WHERE fc.file_id = ${id}
    ORDER BY c.name
  `;
  return Response.json(rows);
}
