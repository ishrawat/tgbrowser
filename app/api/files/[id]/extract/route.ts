import { sql } from '@/lib/db';

export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rows = (await sql`SELECT file_id, mime_type, content_text FROM files WHERE id = ${id}`) as any[];
  if (rows.length === 0) return new Response('not found', { status: 404 });
  const file = rows[0];
  if (file.mime_type !== 'application/pdf') {
    return Response.json({ ok: true, skipped: 'not a pdf' });
  }
  if (file.content_text) {
    return Response.json({ ok: true, skipped: 'already extracted' });
  }

  const tgRes = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${file.file_id}`
  );
  const tgData = await tgRes.json();
  if (!tgData.ok) return Response.json({ ok: false, error: 'getFile failed' }, { status: 502 });

  const pdfRes = await fetch(
    `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${tgData.result.file_path}`
  );
  if (!pdfRes.ok) return Response.json({ ok: false, error: 'download failed' }, { status: 502 });

  const buffer = Buffer.from(await pdfRes.arrayBuffer());

  try {
    const mod: any = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || '').slice(0, 500000);
    await sql`
      UPDATE files
      SET content_text = ${text}, text_extracted_at = now()
      WHERE id = ${id}
    `;
    return Response.json({ ok: true, chars: text.length });
  } catch (e: any) {
    return Response.json({ ok: false, error: e.message || 'parse error' }, { status: 500 });
  }
}
