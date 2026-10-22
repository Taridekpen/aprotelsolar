import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiList, apiUrl, queryString, uploadFile } from '../lib/api';
import { when } from '../lib/format';
import { useCan } from '../session';
import { type MediaAsset, mediaUrl } from '../components/media-picker';
import { Empty, ErrorText, Loading, Pager, useConfirm, useToast } from '../components/ui';

export function MediaPage() {
  const [params, setParams] = useSearchParams();
  const can = useCan();
  const confirm = useConfirm();
  const toast = useToast();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [altText, setAltText] = useState('');
  const query = useQuery({
    queryKey: ['media', params.toString()],
    queryFn: () => apiList<MediaAsset>(`/api/v1/admin/media${queryString({ q: params.get('q') ?? undefined, page: params.get('page') ?? 1, pageSize: 24 })}`),
  });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const file of files) {
      const text = altText.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 200);
      try {
        setProgress(0);
        await uploadFile('/api/v1/admin/media', file, { altText: text }, setProgress);
      } catch (uploadError) {
        setError(uploadError);
        setProgress(null);
        return;
      }
    }
    setProgress(null);
    await client.invalidateQueries({ queryKey: ['media'] });
    toast('Upload finished.');
  }

  return (
    <div>
      <p>Images stay in MongoDB. Product and page records store the media identifier, not the file bytes.</p>
      <form className="filters" onSubmit={(event) => { event.preventDefault(); const q = String(new FormData(event.currentTarget).get('q') ?? ''); const next = new URLSearchParams(params); if (q) next.set('q', q); else next.delete('q'); next.delete('page'); setParams(next); }}>
        <input name="q" defaultValue={params.get('q') ?? ''} aria-label="Search media" placeholder="Search filename or alt text" />
        <button className="btn secondary" type="submit">Search</button>
      </form>
      {can('media:upload') ? (
        <div className="panel">
          <label className="field">Alternative text<input value={altText} onChange={(event) => setAltText(event.target.value)} /></label>
          <label className="field">Upload JPEG, PNG, or WebP<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void upload(event.target.files)} /></label>
          {progress != null ? <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress * 100}%` }} /></div> : null}
        </div>
      ) : null}
      <ErrorText error={error ?? query.error} />
      {query.isLoading ? <Loading label="Loading media" /> : null}
      {query.data?.items.length === 0 ? <Empty title="No images" body="Upload an image or change the search." /> : null}
      <div className="media-grid">
        {query.data?.items.map((asset) => (
          <button className="media-card" type="button" key={asset.id} onClick={() => { setSelected(asset); setAltText(asset.altText); }}>
            <img src={apiUrl(asset.urls.thumbnail)} alt={asset.altText} />
            <small>{asset.originalFilename}</small>
            <small>{asset.usage.length ? `${asset.usage.length} in use` : 'Unused'}</small>
          </button>
        ))}
      </div>
      <Pager meta={query.data?.meta} onPage={(page) => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }} />
      {selected ? (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Image details">
          <div className="row"><h2>{selected.originalFilename}</h2><button className="btn secondary" type="button" onClick={() => setSelected(null)}>Close</button></div>
          <img src={mediaUrl(selected.id, 'medium')} alt={selected.altText} style={{ width: '100%', height: 180, objectFit: 'contain' }} />
          <p>{selected.width} × {selected.height} · {selected.size} bytes · {when(selected.createdAt)}</p>
          <p>References: {selected.usage.length === 0 ? 'none' : selected.usage.length}</p>
          <label className="field">Alternative text<input value={altText} onChange={(event) => setAltText(event.target.value)} /></label>
          {can('media:upload') ? <button className="btn" type="button" onClick={() => void api(`/api/v1/admin/media/${selected.id}`, { method: 'PATCH', json: { altText } }).then(async () => { toast('Alternative text saved.'); await client.invalidateQueries({ queryKey: ['media'] }); })}>Save text</button> : null}
          {can('media:upload') ? <label className="field">Replace file<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setProgress(0); void uploadFile(`/api/v1/admin/media/${selected.id}/content`, file, {}, setProgress, 'PUT').then(async () => { setProgress(null); toast('Image replaced.'); await client.invalidateQueries({ queryKey: ['media'] }); }).catch((replaceError) => { setProgress(null); setError(replaceError); }); }} /></label> : null}
          {can('media:delete') ? <button className="btn danger" type="button" disabled={selected.usage.length > 0} onClick={() => void confirm({ title: 'Delete this image?', body: 'Unused images can be removed. Images referenced by products or pages stay in the library.', danger: true, confirmLabel: 'Delete' }).then(async (ok) => { if (!ok) return; try { await api(`/api/v1/admin/media/${selected.id}`, { method: 'DELETE' }); setSelected(null); toast('Image deleted.'); await client.invalidateQueries({ queryKey: ['media'] }); } catch (deleteError) { setError(deleteError); } })}>Delete unused image</button> : null}
          {selected.usage.length > 0 ? <p className="muted">This image is referenced, so deletion stays disabled.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
