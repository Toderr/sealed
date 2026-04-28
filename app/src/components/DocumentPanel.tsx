"use client";

import { useState, useRef, useEffect } from "react";

interface DocRecord {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  submitter_wallet: string;
  storage_key: string;
  created_at: string;
  scan_status: string;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DocumentPanel({
  dealId,
  uploaderWallet,
}: {
  dealId: string;
  uploaderWallet: string;
}) {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocs();
  }, [dealId]);

  async function fetchDocs() {
    try {
      const res = await fetch(`/api/deliverables?deal_id=${dealId}`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data.deliverables ?? []);
      }
    } catch {
      // graceful — docs are optional
    }
  }

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "x-wallet": uploaderWallet,
          "x-deal-id": dealId,
        },
        body: form,
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? "Upload failed");
        return;
      }

      await fetchDocs();
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    uploadFile(files[0]);
  }

  async function openDoc(doc: DocRecord) {
    const res = await fetch(`/api/upload/signed?key=${encodeURIComponent(doc.storage_key)}`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="surface-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-card-border-subtle">
        <h3 className="text-[13px] text-primary" style={{ fontWeight: 590 }}>
          Documents
        </h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="btn-ghost h-7 px-3 rounded-md text-[12px] flex items-center gap-1.5 disabled:opacity-40"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {uploading ? "Uploading…" : "Add file"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Drag & drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`p-5 space-y-3 transition-colors ${dragOver ? "bg-accent/5" : ""}`}
      >
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-danger/10 border border-danger/20 px-3 py-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger flex-shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <p className="text-[12px] text-danger">{error}</p>
          </div>
        )}

        {docs.length === 0 && !uploading && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-card-border rounded-lg py-8 flex flex-col items-center gap-2 text-center cursor-pointer hover:border-accent/40 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-[13px] text-muted">Drop files here or click to upload</p>
            <p className="text-[11px] text-subtle">PDF, DOCX, XLSX, PNG, JPG · Max 10 MB</p>
          </div>
        )}

        {docs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-3 rounded-lg border border-card-border-subtle px-3 py-2.5 hover:bg-surface-hover/50 transition-colors"
          >
            <div className="w-8 h-8 rounded bg-surface-hover flex items-center justify-center flex-shrink-0">
              <FileIcon mime={doc.content_type} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-primary truncate" style={{ fontWeight: 510 }}>
                {doc.filename}
              </p>
              <p className="text-[11px] text-muted">
                {formatBytes(doc.size_bytes)} · {timeAgo(doc.created_at)}
                {doc.scan_status === "clean" && (
                  <span className="ml-1.5 text-success">✓ Verified</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => openDoc(doc)}
                className="btn-ghost h-7 px-2.5 rounded-md text-[11px]"
              >
                View
              </button>
              <a
                href={`/api/upload/signed?key=${encodeURIComponent(doc.storage_key)}`}
                download={doc.filename}
                className="btn-ghost h-7 px-2.5 rounded-md text-[11px] flex items-center"
              >
                ↓
              </a>
            </div>
          </div>
        ))}

        {uploading && (
          <div className="flex items-center gap-2 text-[13px] text-muted px-1">
            <span className="animate-pulse">Uploading and verifying…</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FileIcon({ mime }: { mime: string }) {
  const color =
    mime === "application/pdf"
      ? "text-danger"
      : mime.startsWith("image/")
      ? "text-accent"
      : "text-muted";

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={color}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
