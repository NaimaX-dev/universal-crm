import { useCallback, useEffect, useRef, useState } from 'react';
import { usersApi } from '../api/usersApi';

export function useDebounce(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

// Loads a list: { rows, total, loading, error, reload }
export function useList(fetcher, params, enabled = true) {
  const [state, setState] = useState({ rows: [], total: 0, loading: enabled, error: null });
  const counter = useRef(0);
  const key = JSON.stringify(params);
  const load = useCallback(() => {
    if (!enabled) return;
    const n = ++counter.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher(JSON.parse(key))
      .then((r) => { if (n === counter.current) setState({ rows: r.rows, total: r.total, loading: false, error: null }); })
      .catch((e) => { if (n === counter.current) setState((s) => ({ ...s, rows: [], loading: false, error: e.message || 'Something went wrong.' })); });
  }, [fetcher, key, enabled]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Loads one thing: { data, loading, error, reload }
export function useAsync(fn, deps = [], enabled = true) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const counter = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    if (!enabled) return;
    const n = ++counter.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => { if (n === counter.current) setState({ data, loading: false, error: null }); })
      .catch((e) => { if (n === counter.current) setState({ data: null, loading: false, error: e.message || 'Something went wrong.' }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Team (id + name) for "assigned to" dropdowns.
export function useTeam() {
  const { data, loading } = useAsync(() => usersApi.team(), []);
  const team = data || [];
  return { team, loading, options: team.filter((t) => t.status === 'active').map((t) => ({ value: t.id, label: t.name })), nameOf: (id) => team.find((t) => t.id === id)?.name || '-' };
}
