import { Eye, EyeOff, Focus, Lock, LockOpen, Search } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { Translate } from './i18n';
import { EVIDENCE_ORDER, type EvidenceStatus } from './library';

export interface OutlinerRow {
  id: string;
  name: string;
  status: EvidenceStatus;
  op?: string;
  volume: number;
  edited: boolean;
}

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

/**
 * Flat part list, windowed so thousands of parts stay cheap. Size dots scale
 * with the cube root of each part's volume so the big parts read first.
 */
export function Outliner({ t, rows, loading, selectedId, scopeIds, hidden, locked, soloId, onSelect, onToggleHidden, onToggleLocked, onToggleSolo }: {
  t: Translate;
  rows: OutlinerRow[];
  loading: boolean;
  selectedId?: string;
  scopeIds: string[];
  hidden: Set<string>;
  locked: Set<string>;
  soloId?: string;
  onSelect: (id: string, additive: boolean) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onToggleSolo: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EvidenceStatus | 'edited' | undefined>();
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(480);
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => {
    const result = new Map<EvidenceStatus, number>();
    for (const row of rows) result.set(row.status, (result.get(row.status) ?? 0) + 1);
    return result;
  }, [rows]);
  const editedCount = rows.filter((row) => row.edited).length;
  const maxVolume = Math.max(1, ...rows.map((row) => row.volume));
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => (!needle || row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle))
      && (!statusFilter || (statusFilter === 'edited' ? row.edited : row.status === statusFilter)));
  }, [query, rows, statusFilter]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(visible.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);
  const scope = new Set(scopeIds);

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = visible.findIndex((row) => row.id === selectedId);
    const next = visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    onSelect(next.id, false);
    const top = visible.indexOf(next) * ROW_HEIGHT;
    const list = listRef.current;
    if (list && (top < list.scrollTop || top + ROW_HEIGHT > list.scrollTop + list.clientHeight)) list.scrollTop = top - list.clientHeight / 2;
  };
  const stop = (event: MouseEvent) => event.stopPropagation();

  return (
    <div className="outliner">
      <label className="st-search">
        <Search size={14} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('parts.search')} aria-label={t('parts.search')} />
      </label>
      <div className="st-chips" role="group" aria-label={t('evidence.strip')}>
        <button className={!statusFilter ? 'is-on' : ''} aria-pressed={!statusFilter} onClick={() => setStatusFilter(undefined)}>
          {t('parts.filterAll')} <span className="num">{rows.length}</span>
        </button>
        {EVIDENCE_ORDER.filter((status) => counts.get(status)).map((status) => (
          <button key={status} className={statusFilter === status ? 'is-on' : ''} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(statusFilter === status ? undefined : status)}>
            <i className={`ev-swatch ev-${status}`} aria-hidden="true" />{t(`evidence.${status}`)} <span className="num">{counts.get(status)}</span>
          </button>
        ))}
        {editedCount > 0 && (
          <button className={statusFilter === 'edited' ? 'is-on' : ''} aria-pressed={statusFilter === 'edited'} onClick={() => setStatusFilter(statusFilter === 'edited' ? undefined : 'edited')}>
            {t('parts.filterEdited')} <span className="num">{editedCount}</span>
          </button>
        )}
      </div>
      {loading ? (
        <div className="outliner-skeleton" aria-label={t('parts.loading')}>{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
      ) : rows.length === 0 ? (
        <p className="st-empty">{t('parts.empty')}</p>
      ) : visible.length === 0 ? (
        <p className="st-empty">{t('parts.noMatch')}</p>
      ) : (
        <div
          ref={(element) => {
            listRef.current = element;
            if (element && element.clientHeight && element.clientHeight !== height) setHeight(element.clientHeight);
          }}
          className="outliner-list"
          role="listbox"
          aria-label={t('parts.title')}
          aria-multiselectable="true"
          tabIndex={0}
          onKeyDown={handleKey}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div style={{ height: visible.length * ROW_HEIGHT, position: 'relative' }}>
            {visible.slice(first, last).map((row, offset) => {
              const isHidden = hidden.has(row.id);
              const isLocked = locked.has(row.id);
              const dot = 4 + 9 * Math.cbrt(row.volume / maxVolume);
              return (
                <div
                  key={row.id}
                  role="option"
                  aria-selected={row.id === selectedId || scope.has(row.id)}
                  className={`outliner-row${row.id === selectedId ? ' is-selected' : scope.has(row.id) ? ' is-scoped' : ''}${isHidden ? ' is-hidden' : ''}${soloId && soloId !== row.id ? ' is-ghost' : ''}`}
                  style={{ top: (first + offset) * ROW_HEIGHT }}
                  title={isLocked ? t('parts.locked') : row.id}
                  onClick={(event) => { if (!isLocked) onSelect(row.id, event.metaKey || event.ctrlKey || event.shiftKey); }}
                >
                  <span className="size-dot" style={{ width: dot, height: dot }} aria-hidden="true" />
                  <i className={`ev-swatch ev-${row.status}`} title={t(`evidence.${row.status}`)} aria-label={t(`evidence.${row.status}`)} />
                  <span className="row-name">{row.name}</span>
                  {row.edited && <span className="edited-dot" title={t('inspector.edited')} aria-label={t('inspector.edited')} />}
                  {row.op && <span className="row-op num">{row.op}</span>}
                  <span className="row-tools" onClick={stop}>
                    <button className={soloId === row.id ? 'is-on' : ''} aria-pressed={soloId === row.id} aria-label={soloId === row.id ? t('parts.unsolo') : t('parts.solo')} title={soloId === row.id ? t('parts.unsolo') : t('parts.solo')} onClick={() => onToggleSolo(row.id)}><Focus size={13} /></button>
                    <button className={isLocked ? 'is-on' : ''} aria-pressed={isLocked} aria-label={isLocked ? t('parts.unlock') : t('parts.lock')} title={isLocked ? t('parts.unlock') : t('parts.lock')} onClick={() => onToggleLocked(row.id)}>{isLocked ? <Lock size={13} /> : <LockOpen size={13} />}</button>
                    <button className={isHidden ? 'is-on' : ''} aria-pressed={isHidden} aria-label={isHidden ? t('parts.show') : t('parts.hide')} title={isHidden ? t('parts.show') : t('parts.hide')} onClick={() => onToggleHidden(row.id)}>{isHidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="st-footnote">{t('parts.multiHint')}</p>
    </div>
  );
}
