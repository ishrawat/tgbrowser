import { sql } from '@/lib/db';

export async function POST(req: Request) {
  const { items } = await req.json();
  if (!Array.isArray(items)) return new Response('bad request', { status: 400 });

  const dead: number[] = [];

  for (const item of items) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${item.file_id}`
      );
      const data = await res.json();
      if (!data.ok) {
        const desc = (data.description || '').toLowerCase();
        if (desc.includes('not found') || desc.includes('file is not') || desc.includes('wrong file')) {
          dead.push(item.id);
        }
      }
    } catch {
      // network error — skip, don't delete
    }
  }

  if (dead.length > 0) {
    await sql`DELETE FROM files WHERE id = ANY(${dead})`;
  }

  return Response.json({ removed: dead, checked: items.length });
}
