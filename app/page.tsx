'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

type File = {
  id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  telegram_date: string;
  starred?: boolean;
};

type Collection = {
  id: number;
  name: string;
  color: string;
  is_smart: boolean;
  rules: any;
  file_count: number;
};

type Stats = {
  total_files: number;
  total_bytes: number;
  images: number;
  videos: number;
  pdfs: number;
  starred: number;
};

type DupGroup = { size_bytes: number; count: number; files: File[] };
type RuleType = '' | 'image' | 'video' | 'pdf';
type ViewMode = 'grid' | 'list';
type Menu = { x: number; y: number; file: File };
type PageView = 'files' | 'duplicates';
type PaletteItem =
  | { kind: 'file'; file: File }
  | { kind: 'action'; label: string; hint?: string; run: () => void };

const SORTS = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'size_asc', label: 'Smallest first' },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function groupByDate(files: File[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 30);
  const buckets: Record<string, File[]> = { Today: [], Yesterday: [], 'This Week': [], 'This Month': [], Earlier: [] };
  for (const f of files) {
    const d = new Date(f.telegram_date);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today) buckets.Today.push(f);
    else if (day >= yesterday) buckets.Yesterday.push(f);
    else if (day >= weekAgo) buckets['This Week'].push(f);
    else if (day >= monthAgo) buckets['This Month'].push(f);
    else buckets.Earlier.push(f);
  }
  return Object.entries(buckets).filter(([, fs]) => fs.length > 0).map(([label, fs]) => ({ label, files: fs }));
}

function fuzzyScore(text: string, q: string) {
  text = text.toLowerCase(); q = q.toLowerCase();
  if (!q) return 1;
  let ti = 0, score = 0;
  for (const c of q) {
    const idx = text.indexOf(c, ti);
    if (idx === -1) return 0;
    score += idx === ti ? 3 : 1;
    ti = idx + 1;
  }
  return score;
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeCollection, setActiveCollection] = useState<number | null>(null);
  const [showStarred, setShowStarred] = useState(false);
  const [view, setView] = useState<PageView>('files');
  const [duplicates, setDuplicates] = useState<DupGroup[]>([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [searchContent, setSearchContent] = useState(false);
  const [type, setType] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [preview, setPreview] = useState<{ id: number; url: string; mime: string; name: string } | null>(null);
  const [previewCollections, setPreviewCollections] = useState<number[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuSub, setMenuSub] = useState(false);
  const [menuMoveSub, setMenuMoveSub] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recent, setRecent] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState('');
  const [mounted, setMounted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState('');
  const [paletteIdx, setPaletteIdx] = useState(0);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const paletteRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [newName, setNewName] = useState('');
  const [isSmart, setIsSmart] = useState(false);
  const [ruleType, setRuleType] = useState<RuleType>('');
  const [ruleName, setRuleName] = useState('');
  const [ruleSizeMin, setRuleSizeMin] = useState('');
  const [ruleSizeMax, setRuleSizeMax] = useState('');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const saved = localStorage.getItem('viewMode') as ViewMode | null;
    if (saved === 'grid' || saved === 'list') setViewMode(saved);
    const r = localStorage.getItem('recent');
    if (r) { try { setRecent(JSON.parse(r)); } catch {} }
  }, []);

  useEffect(() => { if (mounted) localStorage.setItem('viewMode', viewMode); }, [viewMode, mounted]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        setPaletteQ('');
        setPaletteIdx(0);
        return;
      }

      if (e.key === 'Escape') {
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (menu) { setMenu(null); setMenuSub(false); setMenuMoveSub(false); return; }
        if (renaming) { setRenaming(false); return; }
        if (preview) { setPreview(null); return; }
        if (selected.size > 0) { setSelected(new Set()); return; }
        if (sidebarOpen) { setSidebarOpen(false); return; }
        return;
      }

      if (paletteOpen) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIdx(i => i + 1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIdx(i => Math.max(0, i - 1)); }
        return;
      }

      if (e.key === '/' && !inInput) { e.preventDefault(); searchRef.current?.focus(); return; }
      if (preview && !inInput) {
        if (e.key === 'ArrowRight') { e.preventDefault(); navigatePreview(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePreview(-1); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [preview, renaming, selected, menu, sidebarOpen, files, paletteOpen]);

  useEffect(() => {
    const close = () => { setMenu(null); setMenuSub(false); setMenuMoveSub(false); };
    if (menu) {
      window.addEventListener('click', close);
      window.addEventListener('scroll', close, true);
      return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
    }
  }, [menu]);

  async function loadCollections() {
    const res = await fetch('/api/collections');
    if (res.ok) setCollections(await res.json());
  }
  async function loadStats() {
    const res = await fetch('/api/stats');
    if (res.ok) setStats(await res.json());
  }
  async function loadDuplicates() {
    const res = await fetch('/api/duplicates');
    if (res.ok) setDuplicates(await res.json());
  }

  async function load(reset = false) {
    setLoading(true);
    const p = reset ? 1 : page;
    const params = new URLSearchParams({ page: String(p), q: debouncedQ, type, sort });
    if (activeCollection) params.set('collection', String(activeCollection));
    if (showStarred) params.set('starred', 'true');
    if (searchContent) params.set('searchContent', 'true');
    const res = await fetch(`/api/files?${params}`);
    const data = await res.json();
    setFiles(reset ? data.files : [...files, ...data.files]);
    setHasMore(data.hasMore);
    setPage(p + 1);
    setLoading(false);
    setInitialLoad(false);
  }

  useEffect(() => { load(true); }, [debouncedQ, type, activeCollection, sort, showStarred, searchContent]);
  useEffect(() => { loadCollections(); loadStats(); }, []);
  useEffect(() => { if (view === 'duplicates') loadDuplicates(); }, [view]);

  function addToRecent(f: File) {
    const next = [f, ...recent.filter(r => r.id !== f.id)].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem('recent', JSON.stringify(next)); } catch {}
  }

  async function open(f: File) {
    const res = await fetch(`/api/files/${f.id}/url`);
    if (!res.ok) { alert('Cannot load file (may exceed 20 MB)'); return; }
    const { url } = await res.json();
    setPreview({ id: f.id, url, mime: f.mime_type, name: f.filename });
    setRenaming(false);
    addToRecent(f);
    const cr = await fetch(`/api/files/${f.id}/collections`);
    if (cr.ok) {
      const data = await cr.json();
      setPreviewCollections(data.map((c: Collection) => c.id));
    }
  }

  async function navigatePreview(dir: number) {
    if (!preview) return;
    const idx = files.findIndex(f => f.id === preview.id);
    if (idx === -1) return;
    const next = files[idx + dir];
    if (!next) return;
    await open(next);
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_ids: ids, collection_id: collectionId }),
    });
    clearSelection(); loadCollections(); load(true);
  }

  async function bulkRemove() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`Remove ${ids.length} files from the dashboard?`)) return;
    for (const id of ids) await fetch(`/api/files/${id}/delete`, { method: 'DELETE' });
    clearSelection(); load(true); loadStats();
  }

  async function renameCurrent() {
    if (!preview || !renameValue.trim()) { setRenaming(false); return; }
    await fetch(`/api/files/${preview.id}/rename`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: renameValue.trim() }),
    });
    setPreview({ ...preview, name: renameValue.trim() });
    setRenaming(false); load(true);
  }

  async function removeCurrent() {
    if (!preview) return;
    if (!confirm('Remove this file from the dashboard?')) return;
    await fetch(`/api/files/${preview.id}/delete`, { method: 'DELETE' });
    setPreview(null); load(true); loadStats();
  }

  async function toggleStar(f: File, e?: React.MouseEvent) {
    e?.stopPropagation();
    const res = await fetch(`/api/files/${f.id}/star`, { method: 'POST' });
    if (res.ok) {
      const { starred } = await res.json();
      setFiles(prev => prev.map(x => x.id === f.id ? { ...x, starred } : x));
      loadStats();
      if (showStarred && !starred) setFiles(prev => prev.filter(x => x.id !== f.id));
    }
  }

  async function renameFileById(f: File) {
    const next = prompt('New name', f.filename);
    if (!next || next === f.filename) return;
    await fetch(`/api/files/${f.id}/rename`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: next }),
    });
    load(true);
  }

  async function removeFileById(f: File) {
    if (!confirm(`Remove "${f.filename}" from dashboard?`)) return;
    await fetch(`/api/files/${f.id}/delete`, { method: 'DELETE' });
    load(true); loadStats();
  }

  async function copyLink(f: File) {
    const res = await fetch(`/api/files/${f.id}/url`);
    if (!res.ok) { alert('Cannot generate link'); return; }
    const { url } = await res.json();
    try { await navigator.clipboard.writeText(url); alert('Link copied'); }
    catch { prompt('Copy this link:', url); }
  }

  async function createShareLink(f: File) {
    const res = await fetch(`/api/files/${f.id}/share`, { method: 'POST' });
    if (!res.ok) { alert('Could not create share link'); return; }
    const { token } = await res.json();
    const url = `${window.location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      alert(`Public link copied:\n${url}\n\nAnyone with this link can view the file.`);
    } catch {
      prompt('Copy this share link:', url);
    }
  }

  async function addFileToCollection(f: File, collectionId: number) {
    await fetch('/api/collections/bulk-add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_ids: [f.id], collection_id: collectionId }),
    });
    loadCollections();
  }

  async function moveFileToCollection(f: File, targetId: number) {
    if (activeCollection) {
      const current = collections.find(c => c.id === activeCollection);
      if (current && !current.is_smart) {
        await fetch('/api/collections/toggle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: f.id, collection_id: activeCollection }),
        });
      }
    }
    await fetch('/api/collections/bulk-add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_ids: [f.id], collection_id: targetId }),
    });
    loadCollections(); load(true);
  }

  function openMenu(f: File, x: number, y: number) {
    setMenu({ x, y, file: f }); setMenuSub(false); setMenuMoveSub(false);
  }
  function handleContextMenu(e: React.MouseEvent, f: File) { e.preventDefault(); openMenu(f, e.clientX, e.clientY); }
  function handleTouchStart(e: React.TouchEvent, f: File) {
    const t = e.touches[0];
    const x = t.clientX, y = t.clientY;
    longPressRef.current = setTimeout(() => openMenu(f, x, y), 500);
  }
  function handleTouchEnd() {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  }

  function handleGridMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-file-id]')) return;
    if (!gridRef.current) return;

    const startX = e.clientX, startY = e.clientY;
    const rect = document.createElement('div');
    rect.style.cssText = 'position:fixed;border:1px solid #3b82f6;background:rgba(59,130,246,0.15);pointer-events:none;z-index:30;';
    document.body.appendChild(rect);

    const onMove = (ev: MouseEvent) => {
      const x = Math.min(startX, ev.clientX);
      const y = Math.min(startY, ev.clientY);
      const w = Math.abs(ev.clientX - startX);
      const h = Math.abs(ev.clientY - startY);
      rect.style.left = x + 'px'; rect.style.top = y + 'px';
      rect.style.width = w + 'px'; rect.style.height = h + 'px';
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      rect.remove();

      const sel = {
        left: Math.min(startX, ev.clientX),
        top: Math.min(startY, ev.clientY),
        right: Math.max(startX, ev.clientX),
        bottom: Math.max(startY, ev.clientY),
      };

      if (sel.right - sel.left < 5 && sel.bottom - sel.top < 5) return;

      const cards = gridRef.current?.querySelectorAll('[data-file-id]');
      const next = new Set(selected);
      cards?.forEach(card => {
        const r = card.getBoundingClientRect();
        const overlap = !(r.right < sel.left || r.left > sel.right || r.bottom < sel.top || r.top > sel.bottom);
        if (overlap) next.add(Number(card.getAttribute('data-file-id')));
      });
      setSelected(next);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function resetForm() {
    setNewName(''); setIsSmart(false); setRuleType(''); setRuleName('');
    setRuleSizeMin(''); setRuleSizeMax(''); setShowCreate(false);
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    loadCollections(); load(true);
  }

  async function toggleInCollection(fileId: number, collectionId: number) {
    const res = await fetch('/api/collections/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, collection_id: collectionId }),
    });
    if (res.ok) {
      const { in: isIn } = await res.json();
      setPreviewCollections(prev => isIn ? [...prev, collectionId] : prev.filter(id => id !== collectionId));
      loadCollections();
    }
  }

  async function extractAllPdfs() {
    if (!confirm('Extract text from all PDFs?')) return;
    setExtracting(true);
    setExtractProgress('Loading list...');
    try {
      const res = await fetch('/api/files/pending-extract');
      const pending = await res.json();
      if (pending.length === 0) { alert('All PDFs already extracted.'); return; }
      let done = 0, failed = 0;
      for (const f of pending) {
        setExtractProgress(`Extracting ${done + failed + 1} / ${pending.length}...`);
        const r = await fetch(`/api/files/${f.id}/extract`, { method: 'POST' });
        if (r.ok) done++; else failed++;
      }
      alert(`Done. Extracted: ${done}. Failed: ${failed}.`);
    } finally {
      setExtracting(false); setExtractProgress('');
    }
  }

  async function logout() {
    document.cookie = 'auth=; Max-Age=0; path=/';
    window.location.href = '/login';
  }

  const activeData = collections.find(c => c.id === activeCollection);
  const manualCollections = collections.filter(c => !c.is_smart);
  const grouped = useMemo(() => (mounted ? groupByDate(files) : []), [files, mounted]);
  const useGrouping = mounted && view === 'files' && viewMode === 'grid' && (sort === 'date_desc' || sort === 'date_asc');

  const previewIndex = preview ? files.findIndex(f => f.id === preview.id) : -1;
  const canPrev = previewIndex > 0;
  const canNext = previewIndex >= 0 && previewIndex < files.length - 1;

  const title = view === 'duplicates' ? '🔁 Duplicates' : showStarred ? '⭐ Starred' : activeData ? activeData.name : 'All Files';

  const paletteItems: PaletteItem[] = useMemo(() => {
    if (!paletteOpen) return [];
    const actions: PaletteItem[] = [
      { kind: 'action', label: 'Toggle grid / list view', hint: 'view', run: () => { setViewMode(viewMode === 'grid' ? 'list' : 'grid'); setPaletteOpen(false); } },
      { kind: 'action', label: 'Sort: Newest first', run: () => { setSort('date_desc'); setPaletteOpen(false); } },
      { kind: 'action', label: 'Sort: Name A–Z', run: () => { setSort('name_asc'); setPaletteOpen(false); } },
      { kind: 'action', label: 'Show All Files', run: () => { setView('files'); setActiveCollection(null); setShowStarred(false); setPaletteOpen(false); } },
      { kind: 'action', label: 'Show Starred', run: () => { setView('files'); setActiveCollection(null); setShowStarred(true); setPaletteOpen(false); } },
      { kind: 'action', label: 'Show Duplicates', run: () => { setView('duplicates'); setPaletteOpen(false); } },
      { kind: 'action', label: 'Extract PDF text', run: () => { setPaletteOpen(false); extractAllPdfs(); } },
      { kind: 'action', label: 'Logout', run: () => logout() },
    ];

    const scoredActions = actions
      .map(a => ({ a, s: fuzzyScore(a.label, paletteQ) }))
      .filter(x => x.s > 0);

    const scoredFiles = paletteQ
      ? files
          .map(f => ({ f, s: fuzzyScore(f.filename, paletteQ) }))
          .filter(x => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 8)
          .map(x => ({ kind: 'file' as const, file: x.f }))
      : files.slice(0, 6).map(f => ({ kind: 'file' as const, file: f }));

    return [...scoredActions.map(x => x.a), ...scoredFiles];
  }, [paletteOpen, paletteQ, files, viewMode]);

  useEffect(() => { setPaletteIdx(0); }, [paletteQ]);

  function runPaletteItem(item: PaletteItem) {
    if (item.kind === 'file') { setPaletteOpen(false); open(item.file); }
    else item.run();
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="md:hidden fixed inset-0 bg-black/60 z-30" />}

      <aside className={`fixed md:static top-0 left-0 h-full w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col z-40 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold">My Vault</h1>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <button
          onClick={() => { setPaletteOpen(true); setPaletteQ(''); setPaletteIdx(0); }}
          className="w-full text-left px-3 py-2 mb-4 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-400 flex items-center justify-between"
        >
          <span>Search / commands</span>
          <kbd className="text-xs px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700">Ctrl K</kbd>
        </button>

        <button
          onClick={() => { setActiveCollection(null); setShowStarred(false); setView('files'); clearSelection(); setSidebarOpen(false); }}
          className={`w-full text-left px-3 py-2 rounded mb-1 text-sm ${activeCollection === null && !showStarred && view === 'files' ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
        >
          📁 All Files
          {stats && <span className="float-right text-xs text-gray-500">{stats.total_files}</span>}
        </button>

        <button
          onClick={() => { setActiveCollection(null); setShowStarred(true); setView('files'); clearSelection(); setSidebarOpen(false); }}
          className={`w-full text-left px-3 py-2 rounded mb-1 text-sm ${showStarred && view === 'files' ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
        >
          ⭐ Starred
          {stats && <span className="float-right text-xs text-gray-500">{stats.starred}</span>}
        </button>

        <button
          onClick={() => { setView('duplicates'); setSidebarOpen(false); }}
          className={`w-full text-left px-3 py-2 rounded mb-1 text-sm ${view === 'duplicates' ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
        >
          🔁 Duplicates
        </button>

        <div className="mt-6 mb-2 flex justify-between items-center px-3">
          <span className="text-xs uppercase text-gray-500 font-semibold tracking-wider">Collections</span>
          <button onClick={() => setShowCreate(true)} className="text-gray-400 hover:text-white text-lg leading-none">+</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {collections.map(c => (
            <div
              key={c.id}
              className={`group flex items-center justify-between px-3 py-2 rounded mb-0.5 cursor-pointer text-sm ${activeCollection === c.id && view === 'files' && !showStarred ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
              onClick={() => { setActiveCollection(c.id); setShowStarred(false); setView('files'); clearSelection(); setSidebarOpen(false); }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {c.is_smart ? <span className="text-xs">⚡</span> : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />}
                <span className="truncate">{c.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-500">{c.is_smart ? 'auto' : c.file_count}</span>
                <button onClick={(e) => deleteCollection(c.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 text-base leading-none">×</button>
              </div>
            </div>
          ))}
          {collections.length === 0 && <p className="text-xs text-gray-600 px-3">None yet — click +</p>}
        </div>

        {recent.length > 0 && (
          <>
            <div className="mt-4 mb-2 px-3"><span className="text-xs uppercase text-gray-500 font-semibold tracking-wider">Recent</span></div>
            <div className="max-h-32 overflow-y-auto">
              {recent.slice(0, 6).map(r => (
                <button key={r.id} onClick={() => open(r)} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded truncate" title={r.filename}>{r.filename}</button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 px-3 flex flex-col gap-2">
          <button onClick={extractAllPdfs} disabled={extracting} className="text-xs text-gray-500 hover:text-white text-left disabled:opacity-50">
            {extracting ? extractProgress : '📝 Extract PDF text'}
          </button>
          <button onClick={logout} className="text-xs text-gray-500 hover:text-white text-left">Logout</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-3 md:p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 md:gap-3 mb-4">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-2xl leading-none w-9 h-9 flex items-center justify-center rounded bg-gray-900 border border-gray-800">☰</button>
            <h2 className="text-xl md:text-2xl font-semibold truncate">{title}</h2>
            {activeData?.is_smart && view === 'files' && (
              <span className="hidden md:inline text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-800">⚡ Smart</span>
            )}
            {stats && view === 'files' && (
              <span className="hidden md:inline text-xs text-gray-500 ml-auto">
                {stats.total_files} files · {formatSize(Number(stats.total_bytes))} · {stats.images} img · {stats.pdfs} pdf · {stats.videos} vid
              </span>
            )}
          </div>

          {view === 'files' && (
            <>
              <div className="flex flex-col md:flex-row gap-2 md:gap-3 mb-4 md:mb-6">
                <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search...  (press /)" className="flex-1 p-2 rounded bg-gray-900 border border-gray-800 focus:border-blue-500 outline-none min-w-0" />
                <div className="flex gap-2 flex-wrap">
                  <label className="flex items-center gap-2 px-3 py-2 rounded bg-gray-900 border border-gray-800 text-sm cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={searchContent} onChange={e => setSearchContent(e.target.checked)} className="accent-blue-500" />
                    <span className="text-gray-400">Search in PDFs</span>
                  </label>
                  <select value={type} onChange={e => setType(e.target.value)} className="p-2 rounded bg-gray-900 border border-gray-800 flex-shrink-0">
                    <option value="">All</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="pdf">PDFs</option>
                  </select>
                  <select value={sort} onChange={e => setSort(e.target.value)} className="p-2 rounded bg-gray-900 border border-gray-800 flex-shrink-0">
                    {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <div className="flex rounded bg-gray-900 border border-gray-800 overflow-hidden flex-shrink-0">
                    <button onClick={() => setViewMode('grid')} className={`px-3 ${viewMode === 'grid' ? 'bg-blue-600' : 'hover:bg-gray-800'}`} title="Grid view">▦</button>
                    <button onClick={() => setViewMode('list')} className={`px-3 ${viewMode === 'list' ? 'bg-blue-600' : 'hover:bg-gray-800'}`} title="List view">☰</button>
                  </div>
                </div>
              </div>

              {initialLoad ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
                  {Array.from({ length: 15 }).map((_, i) => (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-2 md:p-3 animate-pulse">
                      <div className="w-full h-28 md:h-32 bg-gray-800 rounded mb-2" />
                      <div className="h-3 bg-gray-800 rounded w-3/4 mb-1.5" />
                      <div className="h-2 bg-gray-800 rounded w-1/3" />
                    </div>
                  ))}
                </div>
              ) : files.length === 0 ? (
                <div className="text-center mt-20">
                  <div className="text-6xl mb-4 opacity-30">{showStarred ? '⭐' : activeCollection ? '📂' : '📭'}</div>
                  <h3 className="text-lg font-medium mb-2">
                    {showStarred ? 'No starred files yet' : activeCollection ? (activeData?.is_smart ? 'No matches yet' : 'Empty collection') : 'Your vault is empty'}
                  </h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    {showStarred ? 'Star any file to pin it here.' : activeCollection ? (activeData?.is_smart ? 'Files matching these rules will appear here.' : 'Open any file to add it to this collection.') : 'Post a file in your Telegram group.'}
                  </p>
                </div>
              ) : viewMode === 'list' ? (
                <FileList files={files} selected={selected} onOpen={open} onToggle={toggleSelect} onStar={toggleStar} onContext={handleContextMenu} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
              ) : useGrouping ? (
                <div ref={gridRef} onMouseDown={handleGridMouseDown} className="space-y-8 pb-24">
                  {grouped.map(g => (
                    <div key={g.label}>
                      <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3 px-1">{g.label}</h3>
                      <FileGrid files={g.files} selected={selected} onOpen={open} onToggle={toggleSelect} onStar={toggleStar} onContext={handleContextMenu} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
                    </div>
                  ))}
                </div>
              ) : (
                <div ref={gridRef} onMouseDown={handleGridMouseDown} className="pb-24">
                  <FileGrid files={files} selected={selected} onOpen={open} onToggle={toggleSelect} onStar={toggleStar} onContext={handleContextMenu} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
                </div>
              )}

              {hasMore && (
                <button onClick={() => load()} disabled={loading} className="mt-6 px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 disabled:opacity-50">
                  {loading ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}

          {view === 'duplicates' && (
            <div className="space-y-6 pb-24">
              {duplicates.length === 0 ? (
                <div className="text-center mt-20">
                  <div className="text-6xl mb-4 opacity-30">✨</div>
                  <h3 className="text-lg font-medium mb-2">No duplicates</h3>
                  <p className="text-sm text-gray-500">All files have unique sizes.</p>
                </div>
              ) : (
                duplicates.map((g, i) => (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                    <div className="text-xs text-gray-500 mb-3">{g.count} files · {formatSize(g.size_bytes)} each</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                      {g.files.map(f => (
                        <div key={f.id} onClick={() => open(f)} onContextMenu={(e) => handleContextMenu(e, f)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 cursor-pointer hover:border-blue-500 transition">
                          {f.mime_type.startsWith('image/') ? (
                            <img src={`/api/files/${f.id}/thumb`} alt={f.filename} className="w-full h-24 object-cover rounded mb-1.5 bg-gray-800" loading="lazy" />
                          ) : (
                            <div className="text-2xl h-24 flex items-center justify-center bg-gray-800 rounded mb-1.5">📄</div>
                          )}
                          <div className="text-xs truncate">{f.filename}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {/* Command Palette */}
      {paletteOpen && (
        <div onClick={() => setPaletteOpen(false)} className="fixed inset-0 bg-black/70 flex items-start justify-center pt-[15vh] z-[70] p-4">
          <div onClick={e => e.stopPropagation()} className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden">
            <input
              ref={paletteRef}
              autoFocus
              value={paletteQ}
              onChange={e => setPaletteQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const item = paletteItems[paletteIdx];
                  if (item) runPaletteItem(item);
                }
              }}
              placeholder="Search files or type a command..."
              className="w-full px-4 py-3 bg-transparent border-b border-gray-800 outline-none text-sm"
            />
            <div className="max-h-80 overflow-y-auto py-1">
              {paletteItems.length === 0 && (
                <div className="px-4 py-6 text-sm text-gray-500 text-center">No matches</div>
              )}
              {paletteItems.map((item, i) => {
                const active = i === paletteIdx;
                return (
                  <button
                    key={i}
                    onMouseEnter={() => setPaletteIdx(i)}
                    onClick={() => runPaletteItem(item)}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 text-sm ${active ? 'bg-blue-600/30 border-l-2 border-blue-500' : ''}`}
                  >
                                        {item.kind === 'file' ? (
                      <>
                        <span className="text-base">
                          {item.file.mime_type.startsWith('image/') ? '🖼' : item.file.mime_type === 'application/pdf' ? '📄' : item.file.mime_type.startsWith('video/') ? '🎬' : '📎'}
                        </span>
                        <span className="truncate flex-1">{item.file.filename}</span>
                        <span className="text-xs text-gray-500">{formatSize(item.file.size_bytes)}</span>
                      </>
                    ) : item.kind === 'action' ? (
                      <>
                        <span className="text-base">⚡</span>
                        <span className="flex-1">{item.label}</span>
                        {item.hint && <span className="text-xs text-gray-500">{item.hint}</span>}
                      </>
                    ) : null}                  </button>
                );
              })}
            </div>
            <div className="px-4 py-2 border-t border-gray-800 text-xs text-gray-500 flex gap-4">
              <span>↑ ↓ navigate</span>
              <span>↵ select</span>
              <span>Esc close</span>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 320) }}
          className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-52 z-[60] text-sm"
        >
          <button onClick={() => { open(menu.file); setMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-800">Open</button>
          <button onClick={() => { toggleStar(menu.file); setMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-800">{menu.file.starred ? '★ Unstar' : '☆ Star'}</button>
          <button onClick={() => { renameFileById(menu.file); setMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-800">Rename</button>
          <button onClick={() => { copyLink(menu.file); setMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-800">Copy link</button>
          <button onClick={() => { createShareLink(menu.file); setMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-800 text-blue-400">🔗 Public share link</button>

          {manualCollections.length > 0 && (
            <div className="relative">
              <button onClick={() => setMenuSub(!menuSub)} className="w-full text-left px-3 py-2 hover:bg-gray-800 flex justify-between items-center">
                <span>Add to collection</span>
                <span className="text-gray-500">›</span>
              </button>
              {menuSub && (
                <div className="absolute left-full top-0 ml-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-48 max-h-60 overflow-y-auto">
                  {manualCollections.map(c => (
                    <button key={c.id} onClick={() => { addFileToCollection(menu.file, c.id); setMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeCollection !== null &&
           !collections.find(c => c.id === activeCollection)?.is_smart &&
           manualCollections.some(c => c.id !== activeCollection) && (
            <div className="relative">
              <button onClick={() => setMenuMoveSub(!menuMoveSub)} className="w-full text-left px-3 py-2 hover:bg-gray-800 flex justify-between items-center">
                <span>Move to collection</span>
                <span className="text-gray-500">›</span>
              </button>
              {menuMoveSub && (
                <div className="absolute left-full top-0 ml-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-48 max-h-60 overflow-y-auto">
                  {manualCollections.filter(c => c.id !== activeCollection).map(c => (
                    <button key={c.id} onClick={() => { moveFileToCollection(menu.file, c.id); setMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="h-px bg-gray-800 my-1" />
          <button onClick={() => { removeFileById(menu.file); setMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-800 text-red-400">Remove</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 md:gap-3 z-40 max-w-[95vw]">
          <span className="text-xs md:text-sm font-medium whitespace-nowrap">{selected.size} selected</span>
          <select onChange={(e) => { if (e.target.value) { bulkAddToCollection(Number(e.target.value)); e.target.value = ''; } }} className="text-xs md:text-sm bg-gray-800 border border-gray-700 rounded px-2 py-1 min-w-0" defaultValue="">
            <option value="">Add to...</option>
            {manualCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={bulkRemove} className="text-xs md:text-sm text-red-400 hover:text-red-300">Remove</button>
          <button onClick={clearSelection} className="text-xs md:text-sm text-gray-400 hover:text-white">Clear</button>
        </div>
      )}

      {showCreate && (
        <div onClick={resetForm} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div onClick={e => e.stopPropagation()} className="bg-gray-900 border border-gray-800 rounded-lg p-5 md:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">New Collection</h3>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 focus:border-blue-500 outline-none mb-4" />
            <button type="button" onClick={() => setIsSmart(!isSmart)} className={`w-full flex items-center justify-between p-3 rounded border mb-4 transition ${isSmart ? 'bg-blue-950/40 border-blue-600' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
              <span className="font-medium">⚡ Smart collection</span>
              <span className={`text-xs ${isSmart ? 'text-blue-300' : 'text-gray-500'}`}>{isSmart ? 'ON' : 'OFF'}</span>
            </button>

            {isSmart && (
              <div className="space-y-3 mb-4 p-3 bg-gray-950 rounded border border-gray-800">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Type</label>
                  <select value={ruleType} onChange={e => setRuleType(e.target.value as RuleType)} className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm">
                    <option value="">Any</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="pdf">PDFs</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Filename contains</label>
                  <input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="e.g. receipt" className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Min MB</label>
                    <input value={ruleSizeMin} onChange={e => setRuleSizeMin(e.target.value)} type="number" className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">Max MB</label>
                    <input value={ruleSizeMax} onChange={e => setRuleSizeMax(e.target.value)} type="number" className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={resetForm} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button onClick={createCollection} disabled={!newName.trim()} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div onClick={() => setPreview(null)} className="fixed inset-0 bg-black flex items-center justify-center p-2 md:p-4 z-50">
          <button onClick={(e) => { e.stopPropagation(); setPreview(null); }} className="absolute top-3 right-3 md:top-4 md:right-4 text-white text-2xl md:text-3xl leading-none hover:text-red-400 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80">×</button>
          {canPrev && <button onClick={(e) => { e.stopPropagation(); navigatePreview(-1); }} className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white text-2xl z-10">‹</button>}
          {canNext && <button onClick={(e) => { e.stopPropagation(); navigatePreview(1); }} className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white text-2xl z-10">›</button>}
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
                <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameCurrent(); if (e.key === 'Escape') setRenaming(false); }} onBlur={renameCurrent} className="flex-1 w-full px-2 py-1 rounded bg-gray-800 border border-blue-500 text-sm outline-none" />
              ) : (
                <span onClick={() => { setRenameValue(preview.name); setRenaming(true); }} className="text-sm text-gray-300 truncate cursor-pointer hover:text-white flex-1 w-full">{preview.name}</span>
              )}
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-xs text-gray-600 hidden md:inline">{previewIndex + 1} / {files.length}</span>
                <button onClick={() => files.find(f => f.id === preview.id) && createShareLink(files.find(f => f.id === preview.id)!)} className="text-sm text-blue-400 hover:underline">Share</button>
                <a href={preview.url} download={preview.name} className="text-sm text-blue-400 hover:underline">Download</a>
                <button onClick={removeCurrent} className="text-sm text-red-400 hover:text-red-300">Remove</button>
              </div>
            </div>
            {manualCollections.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 w-full max-w-5xl px-2">
                <span className="text-xs text-gray-500">Add to:</span>
                {manualCollections.map(c => {
                  const isIn = previewCollections.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => toggleInCollection(preview.id, c.id)} className={`text-xs px-2.5 py-1 rounded-full border transition ${isIn ? 'text-white' : 'text-gray-400 hover:text-white'}`} style={{ borderColor: isIn ? c.color : '#374151', background: isIn ? `${c.color}22` : 'transparent' }}>
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

function FileGrid({ files, selected, onOpen, onToggle, onStar, onContext, onTouchStart, onTouchEnd }: {
  files: File[]; selected: Set<number>;
  onOpen: (f: File) => void; onToggle: (id: number, e: React.MouseEvent) => void;
  onStar: (f: File, e?: React.MouseEvent) => void;
  onContext: (e: React.MouseEvent, f: File) => void;
  onTouchStart: (e: React.TouchEvent, f: File) => void; onTouchEnd: () => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
      {files.map(f => {
        const isSel = selected.has(f.id);
        return (
          <div key={f.id} data-file-id={f.id} onClick={() => onOpen(f)} onContextMenu={(e) => onContext(e, f)} onTouchStart={(e) => onTouchStart(e, f)} onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd}
            className={`relative group bg-gray-900 border rounded-lg p-2 md:p-3 text-left cursor-pointer transition select-none ${isSel ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-gray-800 hover:border-blue-500'}`}>
            <div onClick={(e) => onToggle(f.id, e)} className={`absolute top-1.5 right-1.5 md:top-2 md:right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition z-10 ${isSel ? 'bg-blue-500 border-blue-500 text-white' : 'bg-black/60 border-white/40 md:opacity-0 md:group-hover:opacity-100'}`}>
              {isSel ? '✓' : ''}
            </div>
            <button onClick={(e) => onStar(f, e)} className={`absolute top-1.5 left-1.5 md:top-2 md:left-2 w-6 h-6 rounded-full flex items-center justify-center text-sm z-10 transition ${f.starred ? 'text-yellow-400 bg-black/60' : 'text-white/60 bg-black/40 md:opacity-0 md:group-hover:opacity-100'}`}>
              {f.starred ? '★' : '☆'}
            </button>
            {f.mime_type.startsWith('image/') ? (
              <img src={`/api/files/${f.id}/thumb`} alt={f.filename} className="w-full h-28 md:h-32 object-cover rounded mb-2 bg-gray-800" loading="lazy" />
            ) : (
              <div className="text-3xl mb-2 h-28 md:h-32 flex items-center justify-center bg-gray-800 rounded">
                {f.mime_type === 'application/pdf' ? '📄' : f.mime_type.startsWith('video/') ? '🎬' : '📎'}
              </div>
            )}
            <div className="text-xs md:text-sm truncate">{f.filename}</div>
            <div className="text-[10px] md:text-xs text-gray-500 mt-0.5">{formatSize(f.size_bytes)}</div>
          </div>
        );
      })}
    </div>
  );
}

function FileList({ files, selected, onOpen, onToggle, onStar, onContext, onTouchStart, onTouchEnd }: {
  files: File[]; selected: Set<number>;
  onOpen: (f: File) => void; onToggle: (id: number, e: React.MouseEvent) => void;
  onStar: (f: File, e?: React.MouseEvent) => void;
  onContext: (e: React.MouseEvent, f: File) => void;
  onTouchStart: (e: React.TouchEvent, f: File) => void; onTouchEnd: () => void;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="hidden md:grid grid-cols-[40px_40px_1fr_100px_100px_140px] gap-2 px-3 py-2 border-b border-gray-800 text-xs uppercase tracking-wider text-gray-500 font-semibold">
        <div></div><div></div><div>Name</div><div>Type</div><div>Size</div><div>Date</div>
      </div>
      {files.map(f => {
        const isSel = selected.has(f.id);
        const typeLabel = f.mime_type.startsWith('image/') ? 'Image' : f.mime_type.startsWith('video/') ? 'Video' : f.mime_type === 'application/pdf' ? 'PDF' : 'File';
        return (
          <div key={f.id} data-file-id={f.id} onClick={() => onOpen(f)} onContextMenu={(e) => onContext(e, f)} onTouchStart={(e) => onTouchStart(e, f)} onTouchEnd={onTouchEnd} onTouchMove={onTouchEnd}
            className={`grid grid-cols-[40px_40px_1fr_80px] md:grid-cols-[40px_40px_1fr_100px_100px_140px] gap-2 px-3 py-2 items-center cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50 transition ${isSel ? 'bg-blue-900/20' : ''}`}>
            <div onClick={(e) => onToggle(f.id, e)} className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${isSel ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-600'}`}>
              {isSel ? '✓' : ''}
            </div>
            <button onClick={(e) => onStar(f, e)} className={`text-base ${f.starred ? 'text-yellow-400' : 'text-gray-600 hover:text-white'}`}>{f.starred ? '★' : '☆'}</button>
            <div className="truncate text-sm">{f.filename}</div>
            <div className="hidden md:block text-xs text-gray-500">{typeLabel}</div>
            <div className="text-xs text-gray-500">{formatSize(f.size_bytes)}</div>
            <div className="hidden md:block text-xs text-gray-500">{new Date(f.telegram_date).toLocaleDateString()}</div>
          </div>
        );
      })}
    </div>
  );
}