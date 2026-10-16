import { sql } from '@/lib/db';

export async function GET() {
  const rows = await sql`
    SELECT c.id, c.name, c.color,
           (SELECT COUNT(*) FROM file_collections fc WHERE fc.collection_id = c.id)::int AS file_count
    FROM collections c
    ORDER BY c.created_at ASC
  `;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name?.trim()) return new Response('name required', { status: 400 });
  const rows = await sql`
    INSERT INTO collections (name) VALUES (${name.trim()}) RETURNING id, name, color
  `;
  return Response.json(rows[0]);
}

export async function PATCH(req: Request) {
  const { id, name, color } = await req.json();
  if (!id) return new Response('id required', { status: 400 });
  await sql`
    UPDATE collections
    SET name = COALESCE(${name ?? null}, name),
        color = COALESCE(${color ?? null}, color)
    WHERE id = ${id}
  `;
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response('id required', { status: 400 });
  await sql`DELETE FROM collections WHERE id = ${id}`;
  return Response.json({ ok: true });
}
