import { sql } from '@/lib/db';

type Rules = {
  type?: 'image' | 'video' | 'pdf';
  nameContains?: string;
  sizeMin?: number;
  sizeMax?: number;
  dateFrom?: string;
  dateTo?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = 40;
  const offset = (page - 1) * limit;
  const q = searchParams.get('q')?.trim();
  const type = searchParams.get('type');
  const collection = searchParams.get('collection');

  const where: string[] = [];
  const params: any[] = [];

  if (q) {
    params.push(`%${q}%`);
    where.push(`(filename ILIKE $${params.length} OR caption ILIKE $${params.length})`);
  }
  if (type === 'image') where.push(`mime_type LIKE 'image/%'`);
  if (type === 'video') where.push(`mime_type LIKE 'video/%'`);
  if (type === 'pdf') where.push(`mime_type = 'application/pdf'`);

  if (collection) {
    const colls = await sql`SELECT is_smart, rules FROM collections WHERE id = ${collection}`;
    const coll = colls[0];

    if (coll?.is_smart && coll.rules) {
      const r = coll.rules as Rules;

      if (r.type === 'image') where.push(`mime_type LIKE 'image/%'`);
      else if (r.type === 'video') where.push(`mime_type LIKE 'video/%'`);
      else if (r.type === 'pdf') where.push(`mime_type = 'application/pdf'`);

      if (r.nameContains) {
        params.push(`%${r.nameContains}%`);
        where.push(`filename ILIKE $${params.length}`);
      }
      if (r.sizeMin) {
        params.push(r.sizeMin);
        where.push(`size_bytes >= $${params.length}`);
      }
      if (r.sizeMax) {
        params.push(r.sizeMax);
        where.push(`size_bytes <= $${params.length}`);
      }
      if (r.dateFrom) {
        params.push(r.dateFrom);
        where.push(`telegram_date >= $${params.length}::timestamptz`);
      }
      if (r.dateTo) {
        params.push(r.dateTo + ' 23:59:59');
        where.push(`telegram_date <= $${params.length}::timestamptz`);
      }
    } else {
      params.push(Number(collection));
      where.push(`EXISTS (SELECT 1 FROM file_collections fc WHERE fc.file_id = files.id AND fc.collection_id = $${params.length})`);
    }
  }

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