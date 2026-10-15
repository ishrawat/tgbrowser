'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push('/');
    else setError('Wrong password');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <form onSubmit={submit} className="bg-gray-900 p-8 rounded-lg w-80">
        <h1 className="text-white text-xl mb-4">Private Vault</h1>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full p-2 rounded bg-gray-800 text-white mb-3"
          autoFocus
        />
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <button className="w-full bg-blue-600 hover:bg-blue-500 text-white p-2 rounded">
          Enter
        </button>
      </form>
    </div>
  );
}
