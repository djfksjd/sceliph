import { Check, Copy, History, Loader2, SendHorizontal, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AssemblyIR } from '../engine/assembly-ir';
import {
  applyAssistChanges,
  parseAssistReply,
  type AssistCallRecord,
  type AssistChange,
  type AssistChangeSummary,
  type AssistMode,
  type AssistModel,
  type AssistServerReply,
  type AssistTurn,
} from './assist-protocol';
import type { Locale, Translate } from './i18n';

export interface CommandLogEntry {
  at: number;
  message: string;
  model: AssistModel;
  summary: AssistChangeSummary[];
  changes: AssistChange[];
  scopeIds: string[];
  record: AssistCallRecord;
}

type Health = 'checking' | 'ok' | 'no-bridge' | 'no-cli';

interface Pending {
  message: string;
  reply: string;
  changes: AssistChange[];
  summary: AssistChangeSummary[];
  next: AssemblyIR;
  record: AssistCallRecord;
}

const HEADERS = { 'Content-Type': 'application/json', 'X-Sceliph-Assist': '1' };

/**
 * ⌘K command bar. Chat answers questions about the model on screen; edit asks
 * the user's Claude CLI for whole-component changes inside the selected scope,
 * shows them as a diff, and applies them only on approval.
 */
export function CommandBar({ t, locale, ir, open, onOpenChange, scopeIds, scopeNames, onClearScope, snapshot, onApply, disabledReason }: {
  t: Translate;
  locale: Locale;
  ir?: AssemblyIR;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeIds: string[];
  scopeNames: Map<string, string>;
  onClearScope: () => void;
  snapshot: () => string | undefined;
  onApply: (next: AssemblyIR, entry: CommandLogEntry) => void;
  disabledReason?: string;
}) {
  const [health, setHealth] = useState<Health>('checking');
  const [mode, setMode] = useState<AssistMode>('chat');
  const [model, setModel] = useState<AssistModel>('sonnet');
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<AssistTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState<string>();
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState<CommandLogEntry[]>([]);
  const [copiedAt, setCopiedAt] = useState<number>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/assist/health', { headers: HEADERS })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) { setHealth('no-bridge'); return; }
        const body = await response.json() as { available?: boolean };
        setHealth(body.available ? 'ok' : 'no-cli');
      })
      .catch(() => { if (active) setHealth('no-bridge'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (scopeIds.length > 0) setMode('edit');
  }, [scopeIds]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [turns, pending, busy]);

  // A new model on screen starts a new conversation.
  useEffect(() => {
    setTurns([]);
    setPending(undefined);
    setError(undefined);
  }, [ir?.name]);

  const blocked = disabledReason ?? (health === 'no-bridge' ? t('cmd.bridgeMissing') : health === 'no-cli' ? t('cmd.cliMissing') : undefined);

  const submit = async () => {
    const message = input.trim();
    if (!message || busy || blocked || !ir) return;
    setBusy(true);
    setError(undefined);
    setPending(undefined);
    const history = turns.slice(-8);
    setTurns((current) => [...current, { role: 'user', text: message }]);
    setInput('');
    try {
      const response = await fetch('/api/assist', {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ mode, model, locale, message, ir, scopeIds: mode === 'edit' ? scopeIds : [], snapshot: snapshot(), history }),
      });
      const body = await response.json() as AssistServerReply & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      if (body.record.isError) throw new Error(body.text || 'Claude CLI error');
      const reply = parseAssistReply(body.text, mode);
      setTurns((current) => [...current, { role: 'assistant', text: reply.reply }]);
      if (mode === 'edit' && reply.changes.length > 0) {
        const applied = applyAssistChanges(ir, reply.changes, scopeIds);
        setPending({ message, reply: reply.reply, changes: reply.changes, summary: applied.summary, next: applied.ir, record: body.record });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    if (!pending) return;
    const entry: CommandLogEntry = { at: Date.now(), message: pending.message, model, summary: pending.summary, changes: pending.changes, scopeIds: [...scopeIds], record: pending.record };
    setLog((current) => [entry, ...current].slice(0, 50));
    onApply(pending.next, entry);
    setPending(undefined);
  };

  const copyChanges = async (entry: CommandLogEntry) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ scopeIds: entry.scopeIds, changes: entry.changes }, null, 2));
      setCopiedAt(entry.at);
    } catch {
      setError('Clipboard unavailable.');
    }
  };

  const scopeLabel = scopeIds.length === 0
    ? t('cmd.scopeAll')
    : scopeIds.slice(0, 3).map((id) => scopeNames.get(id) ?? id).join(', ') + (scopeIds.length > 3 ? ` +${scopeIds.length - 3}` : '');

  if (!open) {
    return (
      <button className="cmd-pill" onClick={() => onOpenChange(true)} aria-label={t('cmd.open')} aria-keyshortcuts="Meta+K">
        <Sparkles size={15} aria-hidden="true" />
        {scopeIds.length > 0 && <span className="scope-chip">{scopeLabel}</span>}
        <span className="cmd-pill-text">{t('cmd.open')}</span>
        <kbd>⌘K</kbd>
      </button>
    );
  }

  return (
    <section className="cmd-panel" role="dialog" aria-label={t('cmd.open')} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onOpenChange(false); } }}>
      <header className="cmd-head">
        <div className="st-segment" role="group" aria-label={t('cmd.open')}>
          {(['chat', 'edit'] as AssistMode[]).map((item) => (
            <button key={item} className={mode === item ? 'is-on' : ''} aria-pressed={mode === item} onClick={() => setMode(item)}>{t(`cmd.${item}`)}</button>
          ))}
        </div>
        <label className="cmd-model">
          <span>{t('cmd.model')}</span>
          <select value={model} onChange={(event) => setModel(event.target.value as AssistModel)}>
            <option value="haiku">Haiku</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
          </select>
        </label>
        <span className={`cmd-health is-${health}`}>{health === 'ok' ? t('cmd.connected') : health === 'checking' ? '…' : ''}</span>
        <button className={`st-icon${showLog ? ' is-on' : ''}`} aria-pressed={showLog} aria-label={t('cmd.log')} title={t('cmd.log')} onClick={() => setShowLog((value) => !value)}><History size={15} /></button>
        <button className="st-icon" aria-label={t('cmd.close')} title={t('cmd.close')} onClick={() => onOpenChange(false)}><X size={15} /></button>
      </header>

      {showLog ? (
        <div className="cmd-thread">
          <p className="st-footnote">{t('cmd.deterministic')}</p>
          {log.length === 0 && <p className="st-empty">{t('cmd.logEmpty')}</p>}
          {log.map((entry) => (
            <article className="cmd-log-entry" key={entry.at}>
              <header><b>{entry.message}</b><time className="num">{new Date(entry.at).toLocaleTimeString(locale)}</time></header>
              <ul>{entry.summary.map((item) => <li key={`${item.op}-${item.id}`}><span className={`op op-${item.op}`}>{item.op}</span>{item.name}<span className="num muted">{item.fields.join(' · ')}</span></li>)}</ul>
              <footer>
                <span className="num muted">{entry.model} · ${entry.record.costUsd.toFixed(3)} · {(entry.record.durationMs / 1000).toFixed(1)}s</span>
                <button className="st-button is-quiet" onClick={() => void copyChanges(entry)}>{copiedAt === entry.at ? <><Check size={13} />{t('cmd.copied')}</> : <><Copy size={13} />{t('cmd.copyChanges')}</>}</button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="cmd-thread" ref={threadRef} aria-live="polite">
          {turns.length === 0 && !busy && <p className="st-empty">{ir ? `${ir.name} · ${ir.components.length} ${t('materials.parts')}` : blocked}</p>}
          {turns.map((turn, index) => <p key={index} className={`turn turn-${turn.role}`}>{turn.text}</p>)}
          {busy && <p className="turn turn-busy"><Loader2 size={14} className="spin" aria-hidden="true" />{t('cmd.thinking')}</p>}
          {pending && (
            <div className="cmd-diff">
              <header><b>{t('cmd.changes', { n: pending.summary.length })}</b><span className="num muted">${pending.record.costUsd.toFixed(3)}</span></header>
              {pending.summary.length === 0 ? <p className="muted">{t('cmd.noChanges')}</p> : (
                <ul>{pending.summary.map((item) => <li key={`${item.op}-${item.id}`}><span className={`op op-${item.op}`}>{item.op}</span>{item.name}<span className="num muted">{item.fields.join(' · ')}</span></li>)}</ul>
              )}
              <footer>
                <button className="st-button is-quiet" onClick={() => setPending(undefined)}>{t('cmd.reject')}</button>
                <button className="st-button is-primary" disabled={pending.summary.length === 0} onClick={approve}>{t('cmd.approve')}</button>
              </footer>
            </div>
          )}
          {error && <p className="cmd-error" role="alert"><b>{t('cmd.error')}</b> {error}</p>}
        </div>
      )}

      <div className="cmd-compose">
        <div className="cmd-scope">
          <span className="muted">{t('cmd.scope')}</span>
          <span className="scope-chip">{scopeLabel}</span>
          {scopeIds.length > 0 && <button className="st-link" onClick={onClearScope}>{t('cmd.clearScope')}</button>}
        </div>
        <div className="cmd-input">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            disabled={Boolean(blocked) || busy}
            placeholder={blocked ?? (mode === 'edit' ? t('cmd.placeholderEdit') : t('cmd.placeholderChat'))}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <button className="st-button is-primary" disabled={Boolean(blocked) || busy || !input.trim()} onClick={() => void submit()} aria-label={t('cmd.send')}>
            {busy ? <Loader2 size={15} className="spin" /> : <SendHorizontal size={15} />}
          </button>
        </div>
        <p className="st-footnote">{t('cmd.sends')}</p>
      </div>
    </section>
  );
}
