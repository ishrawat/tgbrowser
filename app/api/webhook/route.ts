import { sql } from '@/lib/db';

export async function POST(req: Request) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== process.env.WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const update = await req.json();
  const msg = update.message || update.channel_post;
  if (!msg) return new Response('ok');

  const doc = msg.document;
  const photo = msg.photo ? msg.photo[msg.photo.length - 1] : null;

  let fileId: string, fileUniqueId: string, filename: string,
      mimeType: string, size: number, thumbFileId: string | null = null;

  if (doc) {
    const ok = doc.mime_type?.startsWith('image/') || doc.mime_type === 'application/pdf';
    if (!ok) return new Response('ok');

    fileId = doc.file_id;
    fileUniqueId = doc.file_unique_id;
    filename = doc.file_name || `file_${msg.message_id}`;
    mimeType = doc.mime_type;
    size = doc.file_size;
    thumbFileId = doc.thumbnail?.file_id ?? null;
  } else if (photo) {
    fileId = photo.file_id;
    fileUniqueId = photo.file_unique_id;
    filename = `photo_${msg.message_id}.jpg`;
    mimeType = 'image/jpeg';
    size = photo.file_size;
    thumbFileId = msg.photo[0].file_id;
  } else {
    return new Response('ok');
  }

  if (size > 20 * 1024 * 1024) return new Response('ok');

  await sql`
    INSERT INTO files (file_id, file_unique_id, message_id, filename, mime_type, size_bytes, caption, sender_name, telegram_date, thumb_file_id)
    VALUES (${fileId}, ${fileUniqueId}, ${msg.message_id}, ${filename}, ${mimeType}, ${size},
            ${msg.caption ?? null}, ${msg.from?.first_name ?? null}, to_timestamp(${msg.date}), ${thumbFileId})
    ON CONFLICT (file_unique_id) DO NOTHING
  `;

  return new Response('ok');
}
