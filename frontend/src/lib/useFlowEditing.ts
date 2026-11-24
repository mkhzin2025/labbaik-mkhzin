import { useEffect, useState } from 'react';
import api from '../api/client';
import { cacheAccess, readCachedAccess } from './access';
import type { Access } from './access';

/** Whether the signed-in member may add and change flows. The backend enforces it; this only hides the controls. */
export function useFlowEditing() {
  const [canEdit, setCanEdit] = useState(() => readCachedAccess()?.canEditFlows !== false);
  useEffect(() => {
    let cancelled = false;
    api.get<Access>('/organizations/me/access')
      .then(({ data }) => {
        if (cancelled) return;
        cacheAccess(data);
        setCanEdit(data.canEditFlows !== false);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return canEdit;
}
