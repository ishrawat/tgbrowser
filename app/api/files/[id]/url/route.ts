import { sql } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = (await sql`SELECT file_id, filename FROM files WHERE id = ${id}`) as any[];
  if (rows.length === 0) return new Response('not found', { status: 404 });

  const file = rows[0];

  const tgRes = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${file.file_id}`
  );
  const data = await tgRes.json();

  if (!data.ok) {
    return Response.json({ error: 'telegram_error', detail: data.description }, { status: 502 });
  }

  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${data.result.file_path}`;
  return Response.json({ url, filename: file.filename });
}
