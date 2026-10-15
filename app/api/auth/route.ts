import { cookies } from 'next/headers';

export async function POST(req: Request) {
  const { password } = await req.json();
  if (password !== process.env.AUTH_PASSWORD) {
    return new Response('unauthorized', { status: 401 });
  }
  (await cookies()).set('auth', process.env.AUTH_SECRET!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return Response.json({ ok: true });
}
