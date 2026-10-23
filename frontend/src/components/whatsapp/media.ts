import { useEffect, useState } from 'react';
import api from '../../api/client';
import type { HeaderMedia } from './templateUtils';

export const mediaFilePath = (media?: HeaderMedia | null) => (media?.file ? `/integrations/meta/whatsapp/media/${media.file}` : null);

/** Fetches a file from an authenticated endpoint and returns an object URL for <img>/<video>. */
export function useAuthedObjectUrl(path?: string | null) {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    api.get(path, { responseType: 'blob' })
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setLoaded({ path, url: objectUrl });
      })
      .catch(() => undefined);
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  return path && loaded?.path === path ? loaded.url : null;
}
