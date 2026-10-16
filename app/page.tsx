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
  is_smart: boolean;
  rules: any;
  file_count: number;
};

type RuleType = '' | 'image' | 'video' | 'pdf';

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
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [newName, setNewName] = useState('');
  const [isSmart, setIsSmart] = useState(false);
  const [ruleType, setRuleType] = useState<RuleType>('');
  const [ruleName, setRuleName] = useState('');
  const [ruleSizeMin, setRuleSizeMin] = useState('');
  const [ruleSizeMax, setRuleSizeMax] = useState('');

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

  function resetForm() {
    setNewName('');
    setIsSmart(false);
    setRuleType('');
    setRuleName('');
    setRuleSizeMin('');
    setRuleSizeMax('');
    setShowCreate(false);
  }

  async function createCollection() {
    if (!newName.trim()) return;
    const rules = isSmart ? {
      type: ruleType || undefined,
      nameContains: ruleName.trim() || undefined,
      sizeMin: ruleSizeMin ? Number(ruleSizeMin) * 1024 * 1024 : undefined,
      sizeMax: ruleSizeMax ? Number(ruleSizeMax) * 1024 * 1024 : undefined,
    } : undefined;

    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), is_smart: isSmart, rules }),
    });
    if (res.ok) {
      resetForm();
      loadCollections();
    } else {
      alert('Failed to create collection');
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

  async function sync() {
    if (!confirm('Check every file against Telegram and remove any that were deleted there? This may take a minute.')) return;
    setSyncing(true);
    setSyncProgress('Loading file list...');
    try {
      const res = await fetch('/api/files/ids');
      const all = await res.json();
      const chunkSize = 20;
      let removed = 0;
      for (let i = 0; i < all.length; i += chunkSize) {
        const chunk = all.slice(i, i + chunkSize);
        setSyncProgress(`Checking ${i + chunk.length} / ${all.length}...`);
        const r = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk }),
        });
        if (r.ok) {
          const data = await r.json();
          removed += data.removed.length;
        }
      }
      alert(`Checked ${all.length} files. Removed ${removed}.`);
      load(true);
    } catch (e) {
      alert('Sync failed');
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  }

  async function logout() {
    document.cookie = 'auth=; Max-Age=0; path=/';
    window.location.href = '/login';
  }

  const activeData = collections.find(c => c.id === activeCollection);
  const manualCollections = collections.filter(c => !c.is_smart);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
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
            onClick={() => setShowCreate(true)}
            className="text-gray-400 hover:text-white text-lg leading-none"
            title="New collection"
          >
            +
          </button>
        </div>

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
                {c.is_smart ? (
                  <span className="text-xs">⚡</span>
                ) : (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                )}
                <span className="truncate">{c.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-500">
                  {c.is_smart ? 'auto' : c.file_count}
                </span>
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
          {collections.length === 0 && (
            <p className="text-xs text-gray-600 px-3">None yet — click +</p>
          )}
        </div>

        <div className="mt-4 px-3 flex flex-col gap-2">
          <button
            onClick={sync}
            disabled={syncing}
            className="text-xs text-gray-500 hover:text-white text-left disabled:opacity-50"
          >
            {syncing ? syncProgress || 'Syncing...' : '🔄 Sync with Telegram'}
          </button>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-white text-left"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-2xl font-semibold">
              {activeData ? activeData.name : 'All Files'}
            </h2>
            {activeData?.is_smart && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-800">
                ⚡ Smart — auto-updates
              </span>
            )}
          </div>

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
                ? activeData?.is_smart
                  ? 'No files match these rules yet. New files will appear here automatically.'
                  : 'No files in this collection yet. Open any file and add it here.'
                : 'No files yet. Post a file in your Telegram group.'}
            </p>
          )}
        </div>
      </main>

      {showCreate && (
        <div
          onClick={resetForm}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-gray-900 border border-gray-800 rounded-lg p-6 w-full max-w-md"
          >
            <h3 className="text-lg font-semibold mb-4">New Collection</h3>

            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Name"
              className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 outline-none mb-4"
            />

            <button
  type="button"
  onClick={() => setIsSmart(!isSmart)}
  className={`w-full flex items-center justify-between p-3 rounded border mb-4 transition ${
    isSmart
      ? 'bg-blue-950/40 border-blue-600'
      : 'bg-gray-800 border-gray-700 hover:border-gray-600'
  }`}
>
  <span className="font-medium flex items-center gap-2">
    ⚡ Smart collection
  </span>
  <span className={`text-xs ${isSmart ? 'text-blue-300' : 'text-gray-500'}`}>
    {isSmart ? 'ON — auto-captures' : 'OFF — manual only'}
  </span>
</button>
            {isSmart && (
              <div className="space-y-3 mb-4 p-3 bg-gray-950 rounded border border-gray-800">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Type</label>
                  <select
                    value={ruleType}
                    onChange={e => setRuleType(e.target.value as RuleType)}
                    className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
                  >
                    <option value="">Any</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="pdf">PDFs</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Filename contains</label>
                  <input
                    value={ruleName}
                    onChange={e => setRuleName(e.target.value)}
                    placeholder="e.g. receipt"
                    className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Min size (MB)</label>
                    <input
                      value={ruleSizeMin}
                      onChange={e => setRuleSizeMin(e.target.value)}
                      type="number"
                      placeholder="0"
                      className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Max size (MB)</label>
                    <input
                      value={ruleSizeMax}
                      onChange={e => setRuleSizeMax(e.target.value)}
                      type="number"
                      placeholder="20"
                      className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={createCollection}
                disabled={!newName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 bg-black flex items-center justify-center p-4 z-50"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setPreview(null); }}
            className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-red-400 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80"
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
              <div className="flex items-center gap-4">
                <a href={preview.url} download={preview.name} className="text-sm text-blue-400 hover:underline">
                  Download
                </a>
                <button
                  onClick={async () => {
                    if (!confirm('Remove from dashboard? (This does not delete the file in Telegram.)')) return;
                    await fetch(`/api/files/${preview.id}/delete`, { method: 'DELETE' });
                    setPreview(null);
                    load(true);
                  }}
                  className="text-sm text-red-400 hover:text-red-300 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>

            {manualCollections.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 w-full max-w-5xl">
                <span className="text-xs text-gray-500">Add to:</span>
                {manualCollections.map(c => {
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
          </div>
        </div>
      )}
    </div>
  );
}
