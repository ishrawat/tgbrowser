import { sql } from '@/lib/db';

export async function POST(req: Request) {
  const { file_ids, collection_id } = await req.json();
  if (!Array.isArray(file_ids) || !collection_id) {
    return new Response('bad request', { status: 400 });
  }

  for (const fid of file_ids) {
    await sql`
      INSERT INTO file_collections (file_id, collection_id)
      VALUES (${fid}, ${collection_id})
      ON CONFLICT DO NOTHING
    `;
  }

  return Response.json({ ok: true, added: file_ids.length });
}
