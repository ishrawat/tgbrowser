import { sql } from '@/lib/db';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    UPDATE files SET starred = NOT starred WHERE id = ${id} RETURNING starred
  `;
  return Response.json({ starred: rows[0]?.starred ?? false });
}
