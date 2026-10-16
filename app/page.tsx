'use client';
import { useEffect, useState } from 'react';

type File = {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  telegram_date: string;
};

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: number; url: string; mime: string; name: string } | null>(null);

  async function load(reset = false) {
    setLoading(true);
    const p = reset ? 1 : page;
    const res = await fetch(`/api/files?page=${p}&q=${encodeURIComponent(q)}&type=${type}`);
    const data = await res.json();
    setFiles(reset ? data.files : [...files, ...data.files]);
    setHasMore(data.hasMore);
    setPage(p + 1);
    setLoading(false);
  }

  useEffect(() => { load(true); }, [q, type]);

async function open(f: File) {
  const res = await fetch(`/api/files/${f.id}/url`);
  if (!res.ok) {
    alert('Cannot load file (may exceed 20 MB)');
    return;
  }
  const { url } = await res.json();
  setPreview({ id: f.id, url, mime: f.mime_type, name: f.filename });
}
  async function logout() {
    document.cookie = 'auth=; Max-Age=0; path=/';
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-semibold">My Vault</h1>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-white">
            Logout
          </button>
        </div>

        <div className="flex gap-3 mb-6">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search..."
            className="flex-1 p-2 rounded bg-gray-900 border border-gray-800"
          />
          <select value={type} onChange={e => setType(e.target.value)}
                  className="p-2 rounded bg-gray-900 border border-gray-800">
            <option value="">All</option>
            <option value="image">Images</option>
            <option value="pdf">PDFs</option>
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {files.map(f => (
            <button
              key={f.id}
              onClick={() => open(f)}
              className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-left hover:border-blue-500 transition"
            >
              {f.mime_type.startsWith('image/') ? (
  <img
    src={`/api/files/${f.id}/thumb`}
    alt={f.filename}
    className="w-full h-32 object-cover rounded mb-2 bg-gray-800"
    loading="lazy"
  />
) : (
  <div className="text-3xl mb-2">📄</div>
)}
              <div className="text-sm truncate">{f.filename}</div>
              <div className="text-xs text-gray-500 mt-1">
                {(f.size_bytes / 1024).toFixed(0)} KB
              </div>
            </button>
          ))}
        </div>

        {hasMore && (
          <button
            onClick={() => load()}
            disabled={loading}
            className="mt-6 px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        )}

        {files.length === 0 && !loading && (
          <p className="text-gray-500 text-center mt-12">
            No files yet. Post an image or PDF in your Telegram group.
          </p>
        )}
      </div>

      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50"
        >
          <div onClick={e => e.stopPropagation()} className="max-w-4xl max-h-full">
            {preview.mime.startsWith('image/') ? (
  <img src={preview.url} alt={preview.name} className="max-h-[90vh] rounded" />
) : preview.mime === 'application/pdf' ? (
  <iframe
    src={`/api/files/${preview.id}/view`}
    className="w-[85vw] h-[90vh] bg-white rounded"
  />
) : (
  <iframe src={preview.url} className="w-[85vw] h-[90vh] bg-white rounded" />
)}
            <div className="flex justify-between items-center mt-3">
              <span className="text-sm text-gray-400">{preview.name}</span>
              <a href={preview.url} download={preview.name}
                 className="text-sm text-blue-400 hover:underline">
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
