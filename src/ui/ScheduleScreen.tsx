import { useMemo, useRef, useState } from 'react';
import { validate, type ISODate } from '../engine';
import { formatDate, issueText, useT } from '../i18n';
import { useCurrentPlan, useStore } from '../store';
import { CellEditor } from './CellEditor';
import { confirmDialog } from './Dialog';
import { Icon } from './Icon';
import { EasyView } from './EasyView';
import { OriginalSheet } from './OriginalSheet';

export function ScheduleScreen() {
  const t = useT();
  const data = useStore((s) => s.data);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const easyMode = useStore((s) => s.easyMode);
  const setEasyMode = useStore((s) => s.setEasyMode);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const generating = useStore((s) => s.generating);
  const generate = useStore((s) => s.generate);
  const lang = useStore((s) => s.lang);
  const plan = useCurrentPlan();
  const issues = useMemo(() => validate(data, plan), [data, plan]);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const [editing, setEditing] = useState<{ staffId: string; date: ISODate } | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const onGenerate = async () => {
    if (await confirmDialog(t.confirmGenerate)) void generate();
  };

  const run = async (fn: () => Promise<void>) => {
    setExportOpen(false);
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const exportExcel = () =>
    run(async () => {
      const { exportExcel } = await import('../export/excel');
      await exportExcel(data, plan, lang);
    });
  const exportPdf = () =>
    run(async () => {
      const { exportPdf } = await import('../export/pdf');
      await exportPdf(data, plan, view === 'original' ? 'original' : 'easy', lang);
    });

  const nameOf = (id?: string) => data.staff.find((s) => s.id === id)?.name ?? '';

  return (
    <div className="screen schedule-screen">
      <div className="toolbar">
        <div className="seg">
          <button className={view === 'original' ? 'on' : ''} onClick={() => setView('original')}>{t.viewOriginal}</button>
          <button className={view === 'easy' ? 'on' : ''} onClick={() => setView('easy')}>{t.viewEasy}</button>
        </div>
        {view === 'easy' ? (
          <div className="seg small">
            <button className={easyMode === 'table' ? 'on' : ''} onClick={() => setEasyMode('table')}>{t.modeTable}</button>
            <button className={easyMode === 'days' ? 'on' : ''} onClick={() => setEasyMode('days')}>{t.modeDays}</button>
          </div>
        ) : (
          <div className="zoom">
            <button className="icon-btn" onClick={() => setZoom(Math.max(0.3, +(zoom - 0.1).toFixed(2)))} aria-label="zoom out">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button className="icon-btn" onClick={() => setZoom(Math.min(2, +(zoom + 0.1).toFixed(2)))} aria-label="zoom in">+</button>
            <button
              className="btn small"
              onClick={() => {
                const w = sheetRef.current?.clientWidth ?? window.innerWidth;
                setZoom(Math.max(0.3, Math.min(1.5, +(w / 1880).toFixed(2))));
              }}
            >
              {t.fit}
            </button>
          </div>
        )}
        <div className="spacer" />
        <button className={`status-pill ${errors.length ? 'bad' : warnings.length ? 'meh' : 'ok'}`} onClick={() => setShowIssues((v) => !v)}>
          <Icon name={errors.length ? 'alert' : 'check'} size={15} />
          {errors.length === 0 && warnings.length === 0 ? t.allGood : `${errors.length ? `${errors.length} ${t.errors}` : ''}${errors.length && warnings.length ? ' · ' : ''}${warnings.length ? `${warnings.length} ${t.warnings}` : ''}`}
        </button>
        <div className="menu-wrap">
          <button className="btn" onClick={() => setExportOpen((v) => !v)} disabled={busy}>
            <Icon name="download" size={17} />
            {busy ? t.exporting : t.export}
          </button>
          {exportOpen ? (
            <div className="menu">
              <button onClick={exportExcel}>{t.exportExcel}</button>
              <button onClick={exportPdf}>{t.exportPdf} ({view === 'original' ? t.viewOriginal : t.viewEasy})</button>
            </div>
          ) : null}
        </div>
        <button className="btn primary" onClick={onGenerate} disabled={generating}>
          <Icon name="sparkle" size={17} />
          {generating ? t.generating : t.generate}
        </button>
      </div>

      {showIssues ? (
        <div className="issues-panel">
          <div className="issues-head">
            <b>{t.issuesTitle}</b>
            <button className="icon-btn" onClick={() => setShowIssues(false)} aria-label={t.close_}>
              <Icon name="close" size={18} />
            </button>
          </div>
          {issues.length === 0 ? <p className="ok-text">✓ {t.allGood}</p> : null}
          <ul>
            {[...errors, ...warnings].map((i, k) => (
              <li
                key={k}
                className={`${i.severity} ${i.staffId && i.date ? 'tap' : ''}`}
                onClick={i.staffId && i.date ? () => setEditing({ staffId: i.staffId!, date: i.date! }) : undefined}
              >
                <span className="dot" />
                {i.date ? <span className="when">{formatDate(t, i.date)}</span> : null}
                {i.staffId ? <b>{nameOf(i.staffId)}</b> : null}
                <span>{issueText(t, i)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`sheet-wrap ${view === 'easy' && easyMode === 'table' ? 'scroll-box' : ''} ${generating ? 'dim' : ''}`} ref={sheetRef}>
        {view === 'original' ? (
          <div className="zoomer" style={{ zoom }}>
            <OriginalSheet data={data} plan={plan} issues={issues} onCellClick={(staffId, date) => setEditing({ staffId, date })} />
          </div>
        ) : (
          <EasyView data={data} plan={plan} issues={issues} mode={easyMode} onCellClick={(staffId, date) => setEditing({ staffId, date })} />
        )}
      </div>
      {plan.generatedAt ? (
        <p className="muted foot">
          {t.lastGenerated}: {new Date(plan.generatedAt).toLocaleString(lang === 'th' ? 'th-TH' : lang === 'ja' ? 'ja-JP' : 'en-GB')}
        </p>
      ) : null}
      {editing ? <CellEditor staffId={editing.staffId} date={editing.date} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
