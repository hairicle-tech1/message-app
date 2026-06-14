import { useEffect, useState } from 'react';
import { fetchFileBlob } from '../api/files';

const blobUrlCache = new Map<string, string>();

export function useFileBlobUrl(fileId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(fileId ? blobUrlCache.get(fileId) ?? null : null);

  useEffect(() => {
    if (!fileId) return;

    const cached = blobUrlCache.get(fileId);
    if (cached) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    fetchFileBlob(fileId)
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        blobUrlCache.set(fileId, objectUrl);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return url;
}
