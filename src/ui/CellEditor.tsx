import { useState } from 'react';
import {
  codeInfo,
  eveningCodeFor,
  getCell,
  isInMonth,
  minutesToHHMM,
  morningCodeFor,
  type ISODate,
} from '../engine';
import { formatDate, useT } from '../i18n';
import { useCurrentPlan, useStore } from '../store';

interface Props {
  staffId: string;
  date: ISODate;
  onClose: () => void;
}

export function CellEditor({ staffId, date, onClose }: Props) {
  const t = useT();
  const data = useStore((s) => s.data);
  const updatePlan = useStore((s) => s.updatePlan);
  const plan = useCurrentPlan();
  const staff = data.staff.find((s) => s.id === staffId)!;
  const cell = getCell(plan, staffId, date);
  const inMonth = isInMonth(date, plan.year, plan.month);
  const readOnly = cell.source === 'carry';

  const [code, setCode] = useState(cell.code);
  const [locked, setLocked] = useState(cell.locked ?? true);
  const [requested, setRequested] = useState((plan.requests[staffId] ?? []).includes(date));
  const [custom, setCustom] = useState('');

  const m = morningCodeFor(staff, date, data.settings);
  const e = eveningCodeFor(staff, date, data.settings);
  const describe = (c: string) => {
    const info = codeInfo(c, data.settings);
    return info.shift ? `${minutesToHHMM(info.shift.start)}–${minutesToHHMM(info.shift.end)}` : '';
  };

  const save = () => {
    updatePlan((p) => {
      const isTrainingOrLeave = ['training', 'leave'].includes(codeInfo(code, data.settings).kind);
      (p.cells[staffId] ??= {})[date] = {
        code: code.trim().toUpperCase(),
        locked: inMonth ? locked || isTrainingOrLeave : true,
        source: inMonth ? (isTrainingOrLeave ? 'fixed' : 'manual') : undefined,
      };
      const reqs = new Set(p.requests[staffId] ?? []);
      if (requested) reqs.add(date);
      else reqs.delete(date);
      p.requests[staffId] = [...reqs].sort();
    });
    onClose();
  };

  const option = (c: string, label: string, kind: string, sub?: string) => (
    <button key={label + c} className={`opt ${kind} ${code === c ? 'sel' : ''}`} onClick={() => setCode(c)} disabled={readOnly}>
      <b>{label}</b>
      {sub ? <small>{sub}</small> : null}
    </button>
  );

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="sheet-modal" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label={t.editCell}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{staff.name}</div>
            <div className="muted">{formatDate(t, date)}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t.close_}>✕</button>
        </div>
        {readOnly ? <p className="note">{t.carryNote}</p> : null}
        <div className="opt-grid">
          {option('', t.off, 'off')}
          {option(m, `${t.morning} ${m}`, 'morning', describe(m))}
          {option(e, `${t.evening} ${e}`, 'evening', describe(e))}
        </div>
        <div className="opt-label">{t.training}</div>
        <div className="opt-row">
          {data.settings.branches.map((b) => option(`TR${b.code}`, `TR${b.code}`, 'training', b.name || undefined))}
        </div>
        <div className="opt-label">{t.leave}</div>
        <div className="opt-row">{data.settings.leaveTypes.map((l) => option(l.code, l.code, 'leave'))}</div>
        <div className="opt-label">{t.customCode}</div>
        <div className="opt-row">
          <input
            className="input code-input"
            value={custom}
            placeholder="e.g. 10A8, 09A5"
            onChange={(ev) => {
              setCustom(ev.target.value.toUpperCase());
              setCode(ev.target.value.toUpperCase());
            }}
            disabled={readOnly}
          />
          {code && codeInfo(code, data.settings).kind === 'unknown' ? <span className="bad-text">?</span> : <span className="muted">{describe(code)}</span>}
        </div>
        {inMonth && !readOnly ? (
          <>
            <label className="check">
              <input type="checkbox" checked={locked} onChange={(ev) => setLocked(ev.target.checked)} />
              {t.lockCell}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={requested}
                onChange={(ev) => {
                  setRequested(ev.target.checked);
                  if (ev.target.checked) setCode('');
                }}
              />
              {t.requestedOff}
            </label>
          </>
        ) : null}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{t.cancel}</button>
          <button className="btn primary" onClick={save} disabled={readOnly}>{t.save}</button>
        </div>
      </div>
    </div>
  );
}
