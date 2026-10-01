import { useEffect, useMemo, useRef, useState } from 'react';

export type ArtworkImage = { path: string; folder: string; name: string };

let catalog: Promise<ArtworkImage[]> | null = null;
function loadCatalog(refresh = false): Promise<ArtworkImage[]> {
  if (!catalog || refresh) {
    catalog = fetch('/api/artwork', { headers: { Accept: 'application/json' } }).then(async response => {
      if (!response.ok) throw new Error(`Artwork service returned ${response.status}.`);
      if (!response.headers.get('content-type')?.includes('json')) throw new Error('The art library isn’t running. Restart the dev server to enable it.');
      const data = await response.json() as { images?: ArtworkImage[] };
      return data.images ?? [];
    });
    catalog.catch(() => { catalog = null; });
  }
  return catalog;
}

/** Loads the image off-screen so a typo in a path is reported instead of silently falling back. */
export function useImageStatus(path: string): 'loading' | 'ok' | 'broken' {
  const [status, setStatus] = useState<'loading' | 'ok' | 'broken'>('loading');
  useEffect(() => {
    if (!path.trim()) { setStatus('broken'); return; }
    let live = true;
    setStatus('loading');
    const image = new Image();
    image.onload = () => { if (live) setStatus('ok'); };
    image.onerror = () => { if (live) setStatus('broken'); };
    image.src = path;
    return () => { live = false; };
  }, [path]);
  return status;
}

const folderLabel = (folder: string) => folder ? folder.split('/').map(part => part.replace(/(^|\s)\S/g, letter => letter.toUpperCase())).join(' / ') : 'Top level';

export function ArtworkBrowser({ open, value, onClose, onSelect }: { open: boolean; value: string; onClose: () => void; onSelect: (path: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ArtworkImage[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('all');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      setError('');
      loadCatalog().then(setImages, cause => setError(`${cause instanceof Error ? cause.message : 'Artwork is unavailable.'} You can still type a path in Artwork path.`));
    } else if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    if (open && images) dialog.current?.querySelector('.au-art-tile[aria-pressed="true"]')?.scrollIntoView({ block: 'center' });
  }, [open, images]);

  const folders = useMemo(() => [...new Set((images ?? []).map(image => image.folder))], [images]);
  const visible = useMemo(() => (images ?? []).filter(image => (folder === 'all' || image.folder === folder) && `${image.name} ${image.folder}`.toLowerCase().includes(search.trim().toLowerCase())), [images, folder, search]);

  async function uploadFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const response = await fetch('/api/artwork', { method: 'POST', headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      const data = await response.json().catch(() => null) as (ArtworkImage & { error?: string }) | null;
      if (!response.ok || !data?.path) throw new Error(data?.error ?? `Upload failed (${response.status}).`);
      setImages(await loadCatalog(true));
      onSelect(data.path);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { setUploading(false); if (upload.current) upload.current.value = ''; }
  }

  return <dialog ref={dialog} className="au-art-dialog" aria-labelledby="au-art-title" onClose={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="au-art-panel">
      <header className="au-art-header">
        <h2 id="au-art-title">Choose artwork</h2>
        <button type="button" className="au-icon-button" aria-label="Close artwork browser" onClick={onClose}>×</button>
      </header>
      <div className="au-art-tools">
        <input type="search" aria-label="Search artwork" placeholder="Search file names…" value={search} onChange={event => setSearch(event.target.value)} autoFocus />
        <select aria-label="Artwork folder" value={folder} onChange={event => setFolder(event.target.value)}>
          <option value="all">All folders</option>
          {folders.map(name => <option key={name} value={name}>{folderLabel(name)}</option>)}
        </select>
        <button type="button" className="au-button au-button-subtle" disabled={uploading} onClick={() => upload.current?.click()}>{uploading ? 'Uploading…' : 'Upload image…'}</button>
        <input ref={upload} className="au-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void uploadFile(event.target.files?.[0])} />
      </div>
      {error && <p className="au-art-error" role="alert">{error}</p>}
      <p className="au-art-count" aria-live="polite">{images === null && !error ? 'Loading artwork…' : `${visible.length} of ${images?.length ?? 0} images`}{' · '}Uploads are saved to assets/card_art/uploads.</p>
      <div className="au-art-grid">
        {visible.map(image => <button type="button" key={image.path} className="au-art-tile" aria-pressed={image.path === value} title={image.path} onClick={() => onSelect(image.path)}>
          <img src={image.path} alt="" loading="lazy" />
          <span>{image.name}</span>
          <small>{folderLabel(image.folder)}</small>
        </button>)}
        {images !== null && visible.length === 0 && <p className="au-art-empty">No images match. Clear the search or pick another folder.</p>}
      </div>
    </div>
  </dialog>;
}
