import { sql } from '@/lib/db';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM files WHERE id = ${id}`;
  return Response.json({ ok: true });
}
