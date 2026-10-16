import { sql } from '@/lib/db';

export async function GET() {
  const rows = await sql`
    SELECT id, name, color, is_smart, rules,
           (SELECT COUNT(*) FROM file_collections fc WHERE fc.collection_id = c.id)::int AS file_count
    FROM collections c
    ORDER BY created_at ASC
  `;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const { name, is_smart, rules } = await req.json();
  if (!name?.trim()) return new Response('name required', { status: 400 });

  const rulesJson = is_smart && rules ? JSON.stringify(rules) : null;

  const rows = await sql`
    INSERT INTO collections (name, is_smart, rules)
    VALUES (${name.trim()}, ${!!is_smart}, ${rulesJson}::jsonb)
    RETURNING id, name, color, is_smart, rules
  `;
  return Response.json(rows[0]);
}

export async function PATCH(req: Request) {
  const { id, name, color, rules } = await req.json();
  if (!id) return new Response('id required', { status: 400 });

  const rulesJson = rules ? JSON.stringify(rules) : null;

  await sql`
    UPDATE collections
    SET name = COALESCE(${name ?? null}, name),
        color = COALESCE(${color ?? null}, color),
        rules = COALESCE(${rulesJson}::jsonb, rules)
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