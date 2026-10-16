import { sql } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { filename } = await req.json();
  if (!filename?.trim()) return new Response('filename required', { status: 400 });
  await sql`UPDATE files SET filename = ${filename.trim()} WHERE id = ${id}`;
  return Response.json({ ok: true });
}
