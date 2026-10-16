'use client';
import { useEffect, useRef, useState } from 'react';

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

type Menu = { x: number; y: number; file: File };

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
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuSub, setMenuSub] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menu) { setMenu(null); return; }
        if (renaming) { setRenaming(false); return; }
        if (preview) { setPreview(null); return; }
        if (selected.size > 0) { setSelected(new Set()); return; }
        if (sidebarOpen) { setSidebarOpen(false); return; }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [preview, renaming, selected, menu, sidebarOpen]);

  useEffect(() => {
    const close = () => { setMenu(null); setMenuSub(false); };
    if (menu) {
      window.addEventListener('click', close);
      window.addEventListener('scroll', close, true);
      return () => {
        window.removeEventListener('click', close);
        window.removeEventListener('scroll', close, true);
      };
    }
  }, [menu]);

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
    setRenaming(false);
    const cr = await fetch(`/api/files/${f.id}/collections`);
    if (cr.ok) {
      const data = await cr.json();
      setPreviewCollections(data.map((c: Collection) => c.id));
    }
  }

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function clearSelection() { setSelected(new Set()); }

  async function bulkAddToCollection(collectionId: number) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await fetch('/api/collections/bulk-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_ids: ids, collection_id: collectionId }),
    });
    clearSelection();
    loadCollections();
    load(true);
  }

  async function bulkRemove() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Remove ${ids.length} files from the dashboard?`)) return;
    for (const id of ids) {
      await fetch(`/api/files/${id}/delete`, { method: 'DELETE' });
    }
    clearSelection();
    load(true);
  }

  async function renameCurrent() {
    if (!preview || !renameValue.trim()) { setRenaming(false); return; }
    await fetch(`/api/files/${preview.id}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: renameValue.trim() }),
    });
    setPreview({ ...preview, name: renameValue.trim() });
    setRenaming(false);
    load(true);
  }

  async function removeCurrent() {
    if (!preview) return;
    if (!confirm('Remove this file from the dashboard?')) return;
    await fetch(`/api/files/${preview.id}/delete`, { method: 'DELETE' });
    setPreview(null);
    load(true);
  }

  async function renameFileById(f: File) {
    const current = f.filename;
    const next = prompt('New name', current);
    if (!next || next === current) return;
    await fetch(`/api/files/${f.id}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: next }),
    });
    load(true);
  }

  async function removeFileById(f: File) {
    if (!confirm(`Remove "${f.filename}" from dashboard?`)) return;
    await fetch(`/api/files/${f.id}/delete`, { method: 'DELETE' });
    load(true);
  }

  async function copyLink(f: File) {
    const res = await fetch(`/api/files/${f.id}/url`);
    if (!res.ok) { alert('Cannot generate link'); return; }
    const { url } = await res.json();
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied');
    } catch {
      prompt('Copy this link:', url);
    }
  }

  async function addFileToCollection(f: File, collectionId: number) {
    await fetch('/api/collections/bulk-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_ids: [f.id], collection_id: collectionId }),
    });
    loadCollections();
  }

  function openMenu(f: File, x: number, y: number) {
    setMenu({ x, y, file: f });
    setMenuSub(false);
  }

  function handleContextMenu(e: React.MouseEvent, f: File) {
    e.preventDefault();
    openMenu(f, e.clientX, e.clientY);
  }

  function handleTouchStart(e: React.TouchEvent, f: File) {
    const t = e.touches[0];
    const x = t.clientX, y = t.clientY;
    longPressRef.current = setTimeout(() => openMenu(f, x, y), 500);
  }

  function handleTouchEnd() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
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
    if (res.ok) { resetForm(); loadCollections(); }
    else alert('Failed');
  }

  async function deleteCollection(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this collection?')) return;
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
  const manualCollections = collections.filter(c => !c.is_smart);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-30"
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col z-40 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-semibold">My Vault</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <button
          onClick={() => { setActiveCollection(null); clearSelection(); setSidebarOpen(false); }}
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
              onClick={() => { setActiveCollection(c.id); clearSelection(); setSidebarOpen(false); }}
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
                <span className="text-xs text-gray-500">{c.is_smart ? 'auto' : c.file_count}</span>
                <button
                  onClick={(e) => deleteCollection(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-base leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {collections.length === 0 && <p className="text-xs text-gray-600 px-3">None yet — click +</p>}
        </div>

        <button
          onClick={logout}
          className="text-xs text-gray-500 hover:text-white mt-4 text-left px-3"
        >
          Logout
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 p-3 md:p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 md:gap-3 mb-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-2xl leading-none w-9 h-9 flex items-center justify-center rounded bg-gray-900 border border-gray-800"
              aria-label="Menu"
            >
              ☰
            </button>
            <h2 className="text-xl md:text-2xl font-semibold truncate">
              {activeData ? activeData.name : 'All Files'}
            </h2>
            {activeData?.is_smart && (
              <span className="hidden md:inline text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-800">
                ⚡ Smart
              </span>
            )}
          </div>

          <div className="flex gap-2 md:gap-3 mb-4 md:mb-6">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search..."
              className="flex-1 p-2 rounded bg-gray-900 border border-gray-800 focus:border-blue-500 outline-none min-w-0"
            />
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="p-2 rounded bg-gray-900 border border-gray-800 flex-shrink-0"
            >
              <option value="">All</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="pdf">PDFs</option>
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3 pb-24">
            {files.map(f => {
              const isSel = selected.has(f.id);
              return (
                <div
                  key={f.id}
                  onClick={() => open(f)}
                  onContextMenu={(e) => handleContextMenu(e, f)}
                  onTouchStart={(e) => handleTouchStart(e, f)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchEnd}
                  className={`relative group bg-gray-900 border rounded-lg p-2 md:p-3 text-left cursor-pointer transition select-none ${
                    isSel ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-gray-800 hover:border-blue-500'
                  }`}
                >
                  <div
                    onClick={(e) => toggleSelect(f.id, e)}
                    className={`absolute top-1.5 right-1.5 md:top-2 md:right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition z-10 ${
                      isSel
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'bg-black/60 border-white/40 md:opacity-0 md:group-hover:opacity-100'
                    }`}
                  >
                    {isSel ? '✓' : ''}
                  </div>
                  {f.mime_type.startsWith('image/') ? (
                    <img
                      src={`/api/files/${f.id}/thumb`}
                      alt={f.filename}
                      className="w-full h-28 md:h-32 object-cover rounded mb-2 bg-gray-800"
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-3xl mb-2 h-28 md:h-32 flex items-center justify-center bg-gray-800 rounded">
                      {f.mime_type === 'application/pdf' ? '📄' : f.mime_type.startsWith('video/') ? '🎬' : '📎'}
                    </div>
                  )}
                  <div className="text-xs md:text-sm truncate">{f.filename}</div>
                  <div className="text-[10px] md:text-xs text-gray-500 mt-0.5">
                    {(f.size_bytes / 1024).toFixed(0)} KB
                  </div>
                </div>
              );
            })}
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
            <p className="text-gray-500 text-center mt-12 text-sm">
              {activeCollection
                ? activeData?.is_smart
                  ? 'No files match these rules yet.'
                  : 'No files in this collection yet.'
                : 'No files yet. Post a file in your Telegram group.'}
            </p>
          )}
        </div>
      </main>

      {/* Context Menu */}
      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.min(menu.x, window.innerWidth - 220),
            top: Math.min(menu.y, window.innerHeight - 260),
          }}
          className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-52 z-[60] text-sm"
        >
          <button
            onClick={() => { open(menu.file); setMenu(null); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-800"
          >
            Open
          </button>
          <button
            onClick={() => { renameFileById(menu.file); setMenu(null); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-800"
          >
            Rename
          </button>
          <button
            onClick={() => { copyLink(menu.file); setMenu(null); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-800"
          >
            Copy link
          </button>

          {manualCollections.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setMenuSub(!menuSub)}
                className="w-full text-left px-3 py-2 hover:bg-gray-800 flex justify-between items-center"
              >
                <span>Add to collection</span>
                <span className="text-gray-500">›</span>
              </button>
              {menuSub && (
                <div className="absolute left-full top-0 ml-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-48 max-h-60 overflow-y-auto">
                  {manualCollections.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { addFileToCollection(menu.file, c.id); setMenu(null); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-800 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="h-px bg-gray-800 my-1" />
          <button
            onClick={() => { removeFileById(menu.file); setMenu(null); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-800 text-red-400"
          >
            Remove
          </button>
        </div>
      )}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 md:gap-3 z-40 max-w-[95vw]">
          <span className="text-xs md:text-sm font-medium whitespace-nowrap">{selected.size} selected</span>
          <select
            onChange={(e) => { if (e.target.value) { bulkAddToCollection(Number(e.target.value)); e.target.value = ''; } }}
            className="text-xs md:text-sm bg-gray-800 border border-gray-700 rounded px-2 py-1 min-w-0"
            defaultValue=""
          >
            <option value="">Add to...</option>
            {manualCollections.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={bulkRemove} className="text-xs md:text-sm text-red-400 hover:text-red-300">
            Remove
          </button>
          <button onClick={clearSelection} className="text-xs md:text-sm text-gray-400 hover:text-white">
            Clear
          </button>
        </div>
      )}

      {/* Create collection modal */}
      {showCreate && (
        <div onClick={resetForm} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div onClick={e => e.stopPropagation()} className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
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
                isSmart ? 'bg-blue-950/40 border-blue-600' : 'bg-gray-800 border-gray-700 hover:border-gray-600'
              }`}
            >
              <span className="font-medium">⚡ Smart collection</span>
              <span className={`text-xs ${isSmart ? 'text-blue-300' : 'text-gray-500'}`}>
                {isSmart ? 'ON' : 'OFF'}
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
                    <label className="text-xs text-gray-500 block mb-1">Min MB</label>
                    <input
                      value={ruleSizeMin}
                      onChange={e => setRuleSizeMin(e.target.value)}
                      type="number"
                      className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Max MB</label>
                    <input
                      value={ruleSizeMax}
                      onChange={e => setRuleSizeMax(e.target.value)}
                      type="number"
                      className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
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

      {/* Preview modal */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 bg-black flex items-center justify-center p-2 md:p-4 z-50"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setPreview(null); }}
            className="absolute top-3 right-3 md:top-4 md:right-4 text-white text-2xl md:text-3xl leading-none hover:text-red-400 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80"
          >
            ×
          </button>
          <div onClick={e => e.stopPropagation()} className="w-full h-full flex flex-col items-center justify-center">
            {preview.mime.startsWith('image/') ? (
              <img src={preview.url} alt={preview.name} className="max-h-[70vh] md:max-h-[75vh] max-w-[95vw] rounded" />
            ) : preview.mime === 'application/pdf' ? (
              <iframe src={`/api/files/${preview.id}/view`} className="w-full h-[70vh] md:h-[75vh] max-w-5xl bg-white rounded" />
            ) : preview.mime.startsWith('video/') ? (
              <video src={preview.url} controls autoPlay className="max-h-[70vh] md:max-h-[75vh] max-w-[95vw] rounded bg-black" />
            ) : (
              <iframe src={preview.url} className="w-full h-[70vh] md:h-[75vh] max-w-5xl bg-white rounded" />
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-3 gap-2 md:gap-3 w-full max-w-5xl px-2">
              {renaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameCurrent();
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                  onBlur={renameCurrent}
                  className="flex-1 w-full px-2 py-1 rounded bg-gray-800 border border-blue-500 text-sm outline-none"
                />
              ) : (
                <span
                  onClick={() => { setRenameValue(preview.name); setRenaming(true); }}
                  className="text-sm text-gray-300 truncate cursor-pointer hover:text-white flex-1 w-full"
                  title="Click to rename"
                >
                  {preview.name}
                </span>
              )}
              <div className="flex items-center gap-4 flex-shrink-0">
                <a href={preview.url} download={preview.name} className="text-sm text-blue-400 hover:underline">
                  Download
                </a>
                <button onClick={removeCurrent} className="text-sm text-red-400 hover:text-red-300">
                  Remove
                </button>
              </div>
            </div>

            {manualCollections.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 w-full max-w-5xl px-2">
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