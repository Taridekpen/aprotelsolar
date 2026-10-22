import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, apiList, apiUrl, queryString, uploadFile } from '../lib/api';
import { ErrorText } from './ui';

export type MediaAsset = {
  id: string;
  originalFilename: string;
  altText: string;
  size: number;
  width: number;
  height: number;
  usage: unknown[];
  urls: { thumbnail: string; medium: string; original: string };
  createdAt?: string;
};

export function mediaUrl(id: string, variant: 'thumbnail' | 'medium' | 'original' = 'thumbnail') {
  return apiUrl(variant === 'original' ? `/api/v1/media/${id}` : `/api/v1/media/${id}?variant=${variant}`);
}

export function MediaPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [altText, setAltText] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const library = useQuery({
    queryKey: ['media-picker', q],
    enabled: open,
    queryFn: () => apiList<MediaAsset>(`/api/v1/admin/media${queryString({ q, pageSize: 24 })}`),
  });

  function move(index: number, direction: -1 | 1) {
    const next = [...value];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const ids = [...value];
    for (const file of files) {
      const text = altText.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 200);
      if (text.length < 1) {
        setError(new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Enter alternative text before uploading.' }));
        return;
      }
      try {
        setProgress(0);
        const asset = (await uploadFile('/api/v1/admin/media', file, { altText: text }, setProgress)) as MediaAsset;
        ids.push(asset.id);
        onChange([...ids]);
      } catch (uploadError) {
        setError(uploadError);
        break;
      } finally {
        setProgress(null);
      }
    }
    void library.refetch();
  }

  return (
    <div>
      <div className="thumb-row">
        {value.map((id, index) => (
          <div className="thumb" key={`${id}-${index}`}>
            <img src={mediaUrl(id)} alt="" />
            <small>{index === 0 ? 'Primary' : `Image ${index + 1}`}</small>
            <div className="row">
              <button className="btn secondary" type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                Up
              </button>
              <button className="btn secondary" type="button" disabled={disabled || index === value.length - 1} onClick={() => move(index, 1)}>
                Down
              </button>
              <button className="btn secondary" type="button" disabled={disabled} onClick={() => onChange(value.filter((_, item) => item !== index))}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {value.length === 0 ? <p className="muted">No images selected. The first image is the primary image.</p> : null}
      </div>
      <div className="actions">
        <button className="btn secondary" type="button" disabled={disabled} onClick={() => setOpen(true)}>
          Choose from library
        </button>
      </div>
      <ErrorText error={error} />
      {progress != null ? (
        <div className="progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} role="progressbar">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      {open ? (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Media library">
          <div className="row">
            <h2>Media library</h2>
            <button className="btn secondary" type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <div className="field">
            <span>Alternative text for uploads</span>
            <input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={200} />
          </div>
          <div className="field">
            <span>Upload images</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled} onChange={(event) => void onFiles(event.target.files)} />
          </div>
          <div className="field">
            <span>Search</span>
            <input value={q} onChange={(event) => setQ(event.target.value)} />
          </div>
          {library.isLoading ? <p>Loading media…</p> : null}
          <ErrorText error={library.error} />
          <div className="media-grid">
            {library.data?.items.map((asset) => {
              const selected = value.includes(asset.id);
              return (
                <button
                  className="media-card"
                  type="button"
                  key={asset.id}
                  onClick={() => onChange(selected ? value.filter((id) => id !== asset.id) : [...value, asset.id])}
                >
                  <img src={apiUrl(asset.urls.thumbnail)} alt={asset.altText} />
                  <small>
                    {selected ? 'Selected' : 'Select'} · {asset.originalFilename}
                  </small>
                </button>
              );
            })}
          </div>
          {library.data && library.data.items.length === 0 ? <p>No images match this search.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
