import { sql } from '@/lib/db';

export async function POST(req: Request) {
  const { file_id, collection_id } = await req.json();
  if (!file_id || !collection_id) return new Response('bad request', { status: 400 });

  const existing = await sql`
    SELECT 1 FROM file_collections WHERE file_id = ${file_id} AND collection_id = ${collection_id}
  `;

  if (existing.length > 0) {
    await sql`DELETE FROM file_collections WHERE file_id = ${file_id} AND collection_id = ${collection_id}`;
    return Response.json({ in: false });
  }
  await sql`INSERT INTO file_collections (file_id, collection_id) VALUES (${file_id}, ${collection_id})`;
  return Response.json({ in: true });
}
