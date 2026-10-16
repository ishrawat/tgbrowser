import { sql } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const rows = (await sql`
    SELECT id, file_id, filename, mime_type, size_bytes
    FROM files WHERE share_token = ${token}
  `) as any[];
  if (rows.length === 0) return new Response('not found', { status: 404 });
  const file = rows[0];

  const tgRes = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${file.file_id}`
  );
  const data = await tgRes.json();
  if (!data.ok) return Response.json({ error: 'telegram' }, { status: 502 });

  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${data.result.file_path}`;
  return Response.json({
    url,
    filename: file.filename,
    mime: file.mime_type,
    size: file.size_bytes,
  });
}
