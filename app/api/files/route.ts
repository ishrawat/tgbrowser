import { sql } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = 40;
  const offset = (page - 1) * limit;
  const q = searchParams.get('q')?.trim();
  const type = searchParams.get('type');

  const where: string[] = [];
  const params: any[] = [];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(filename ILIKE $${params.length} OR caption ILIKE $${params.length})`);
  }
  if (type === 'image') where.push(`mime_type LIKE 'image/%'`);
  if (type === 'pdf') where.push(`mime_type = 'application/pdf'`);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const files = (await sql.query(
    `SELECT id, filename, mime_type, size_bytes, telegram_date
     FROM files ${whereSql}
     ORDER BY telegram_date DESC
     LIMIT ${limit + 1} OFFSET ${offset}`,
    params
  )) as any[];

  const hasMore = files.length > limit;
  return Response.json({ files: files.slice(0, limit), page, hasMore });
}
