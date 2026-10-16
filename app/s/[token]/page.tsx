'use client';
import { use, useEffect, useState } from 'react';

type ShareData = { url: string; filename: string; mime: string; size: number };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError('File not found or link expired'));
  }, [token]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      {error && (
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-30">🔗</div>
          <h1 className="text-xl font-semibold mb-2">Link unavailable</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      )}

      {!data && !error && (
        <div className="text-gray-500 text-sm">Loading...</div>
      )}

      {data && (
        <div className="w-full max-w-5xl flex flex-col items-center">
          {data.mime.startsWith('image/') ? (
            <img src={data.url} alt={data.filename} className="max-h-[80vh] max-w-full rounded" />
          ) : data.mime === 'application/pdf' ? (
            <iframe src={data.url} className="w-full h-[80vh] bg-white rounded" />
          ) : data.mime.startsWith('video/') ? (
            <video src={data.url} controls autoPlay className="max-h-[80vh] max-w-full rounded bg-black" />
          ) : (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📎</div>
              <p className="text-gray-400 mb-4">Preview not available</p>
              <a href={data.url} download={data.filename} className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 text-sm">
                Download {data.filename}
              </a>
            </div>
          )}

          <div className="flex items-center gap-4 mt-4 text-sm">
            <span className="text-gray-400 truncate max-w-md">{data.filename}</span>
            <span className="text-gray-600">{formatSize(data.size)}</span>
            <a href={data.url} download={data.filename} className="text-blue-400 hover:underline">Download</a>
          </div>
        </div>
      )}
    </div>
  );
}
