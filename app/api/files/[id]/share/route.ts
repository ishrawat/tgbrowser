import { sql } from '@/lib/db';
import { randomBytes } from 'crypto';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = randomBytes(12).toString('base64url');
  await sql`UPDATE files SET share_token = ${token} WHERE id = ${id}`;
  return Response.json({ token });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`UPDATE files SET share_token = NULL WHERE id = ${id}`;
  return Response.json({ ok: true });
}
