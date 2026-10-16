'use client';
import { useEffect, useState } from 'react';

type File = {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  telegram_date: string;
};

type Collection = {
  id: number;
  name: string;
  color: string;
  file_count: number;
};

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: number; url: string; mime: string; name: string } | null>(null);
  const [previewCollections, setPreviewCollections] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setPreview(null);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  async function loadCollections() {
    const res = await fetch('/api/collections');
    if (res.ok) setCollections(await res.json());
  }

  async function load(reset = false) {
    setLoading(true);
    const p = reset ? 1 : page;
    const params = new URLSearchParams({ page: String(p), q: debouncedQ, type });
    if (activeCollection) params.set('collection', String(activeCollection));
    const res = await fetch(`/api/files?${params}`);
    const data = await res.json();
    setFiles(reset ? data.files : [...files, ...data.files]);
    setHasMore(data.hasMore);
    setPage(p + 1);
    setLoading(false);
  }

  useEffect(() => { load(true); }, [debouncedQ, type, activeCollection]);
  useEffect(() => { loadCollections(); }, []);

  async function open(f: File) {
    const res = await fetch(`/api/files/${f.id}/url`);
    if (!res.ok) { alert('Cannot load file (may exceed 20 MB)'); return; }
    const { url } = await res.json();
    setPreview({ id: f.id, url, mime: f.mime_type, name: f.filename });
    const cr = await fetch(`/api/files/${f.id}/collections`);
    if (cr.ok) {
      const data = await cr.json();
      setPreviewCollections(data.map((c: Collection) => c.id));
    }
  }

  async function createCollection() {
    if (!newName.trim()) return;
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      setNewName('');
      setCreating(false);
      loadCollections();
    }
  }

  async function deleteCollection(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this collection? Files stay, only the grouping is removed.')) return;
    await fetch(`/api/collections?id=${id}`, { method: 'DELETE' });
    if (activeCollection === id) setActiveCollection(null);
    loadCollections();
    load(true);
  }

  async function toggleInCollection(fileId: number, collectionId: number) {
    const res = await fetch('/api/collections/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, collection_id: collectionId }),
    });
    if (res.ok) {
      const { in: isIn } = await res.json();
      setPreviewCollections(prev =>
        isIn ? [...prev, collectionId] : prev.filter(id => id !== collectionId)
      );
      loadCollections();
    }
  }

  async function logout() {
    document.cookie = 'auth=; Max-Age=0; path=/';
    window.location.href = '/login';
  }

  const activeData = collections.find(c => c.id === activeCollection);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 bg-gray-900 border-r border-gray-800 p-4 flex-col">
        <h1 className="text-xl font-semibold mb-6">My Vault</h1>

        <button
          onClick={() => setActiveCollection(null)}
          className={`w-full text-left px-3 py-2 rounded mb-1 text-sm ${
            activeCollection === null ? 'bg-gray-800' : 'hover:bg-gray-800'
          }`}
        >
          📁 All Files
        </button>

        <div className="mt-6 mb-2 flex justify-between items-center px-3">
          <span className="text-xs uppercase text-gray-500 font-semibold tracking-wider">Collections</span>
          <button
            onClick={() => setCreating(true)}
            className="text-gray-400 hover:text-white text-lg leading-none"
            title="New collection"
          >
            +
          </button>
        </div>

        {creating && (
          <div className="mb-2 px-3">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createCollection();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              onBlur={() => { if (!newName) setCreating(false); }}
              placeholder="Name, then Enter"
              className="w-full px-2 py-1 text-sm rounded bg-gray-800 border border-gray-700 focus:border-blue-500 outline-none"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {collections.map(c => (
            <div
              key={c.id}
              className={`group flex items-center justify-between px-3 py-2 rounded mb-0.5 cursor-pointer text-sm ${
                activeCollection === c.id ? 'bg-gray-800' : 'hover:bg-gray-800'
              }`}
              onClick={() => setActiveCollection(c.id)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <span className="truncate">{c.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-500">{c.file_count}</span>
                <button
                  onClick={(e) => deleteCollection(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-base leading-none"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {collections.length === 0 && !creating && (
            <p className="text-xs text-gray-600 px-3">None yet — click +</p>
          )}
        </div>

        <button
          onClick={logout}
          className="text-xs text-gray-500 hover:text-white mt-4 text-left px-3"
        >
          Logout
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-semibold mb-4">
            {activeData ? activeData.name : 'All Files'}
          </h2>

          <div className="flex gap-3 mb-6">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search..."
              className="flex-1 p-2 rounded bg-gray-900 border border-gray-800 focus:border-blue-500 outline-none"
            />
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="p-2 rounded bg-gray-900 border border-gray-800"
            >
              <option value="">All</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
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
                  <div className="text-3xl mb-2 h-32 flex items-center justify-center bg-gray-800 rounded">
                    {f.mime_type === 'application/pdf' ? '📄' : f.mime_type.startsWith('video/') ? '🎬' : '📎'}
                  </div>
                )}
                <div className="text-sm truncate">{f.filename}</div>
                <div className="text-xs text-gray-500 mt-1">{(f.size_bytes / 1024).toFixed(0)} KB</div>
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
              {activeCollection
                ? 'No files in this collection yet. Open any file and add it here.'
                : 'No files yet. Post an image or PDF in your Telegram group.'}
            </p>
          )}
        </div>
      </main>

      {/* Preview Modal */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 bg-black flex items-center justify-center p-4 z-50"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setPreview(null); }}
            className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-red-400 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80"
            aria-label="Close"
          >
            ×
          </button>
          <div onClick={e => e.stopPropagation()} className="w-full h-full flex flex-col items-center justify-center">
            {preview.mime.startsWith('image/') ? (
              <img src={preview.url} alt={preview.name} className="max-h-[75vh] max-w-[90vw] rounded" />
            ) : preview.mime === 'application/pdf' ? (
              <iframe src={`/api/files/${preview.id}/view`} className="w-full h-[75vh] max-w-5xl bg-white rounded" />
            ) : preview.mime.startsWith('video/') ? (
              <video src={preview.url} controls autoPlay className="max-h-[75vh] max-w-[90vw] rounded bg-black" />
            ) : (
              <iframe src={preview.url} className="w-full h-[75vh] max-w-5xl bg-white rounded" />
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-3 gap-3 w-full max-w-5xl">
              <span className="text-sm text-gray-400 truncate">{preview.name}</span>
              <a href={preview.url} download={preview.name} className="text-sm text-blue-400 hover:underline">
                Download
              </a>
            </div>

            {collections.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 w-full max-w-5xl">
                <span className="text-xs text-gray-500">Add to:</span>
                {collections.map(c => {
                  const isIn = previewCollections.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleInCollection(preview.id, c.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        isIn ? 'text-white' : 'text-gray-400 hover:text-white'
                      }`}
                      style={{
                        borderColor: isIn ? c.color : '#374151',
                        background: isIn ? `${c.color}22` : 'transparent',
                      }}
                    >
                      {isIn ? '✓ ' : ''}{c.name}
                    </button>
                  );
                })}
              </div>
            )}
            {collections.length === 0 && (
              <p className="text-xs text-gray-600 mt-3">Create a collection in the sidebar to organize files</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}