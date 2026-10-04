import { useMemo, useState } from 'react';
import {
  codeInfo,
  getCell,
  monthDates,
  offRequests,
  requestConflicts,
  requestStatus,
  scheduledStaff,
  setRequest,
  weekday,
  type ISODate,
  type RequestKind,
} from '../engine';
import { fill, formatDate, useT } from '../i18n';
import { useCurrentPlan, useStore } from '../store';
import { confirmDialog } from './Dialog';
import { Icon, type IconName } from './Icon';

const KINDS: { id: RequestKind; icon: IconName }[] = [
  { id: 'off', icon: 'off' },
  { id: 'morning', icon: 'sun' },
  { id: 'evening', icon: 'moon' },
];

export function RequestScreen() {
  const t = useT();
  const data = useStore((s) => s.data);
  const updatePlan = useStore((s) => s.updatePlan);
  const generate = useStore((s) => s.generate);
  const generating = useStore((s) => s.generating);
  const plan = useCurrentPlan();
  const staff = scheduledStaff(data);
  const dates = monthDates(plan.year, plan.month);
  const maxOff = data.settings.rules.maxRequestsPerPerson;

  const [person, setPerson] = useState(staff[0]?.id ?? '');
  const [kind, setKind] = useState<RequestKind>('off');
  const [picked, setPicked] = useState<ISODate[]>([]);
  const [note, setNote] = useState('');

  const kindLabel = (k: RequestKind) => (k === 'off' ? t.reqKind_off : k === 'morning' ? t.reqKind_morning : t.reqKind_evening);

  const rows = useMemo(
    () =>
      staff
        .map((s) => ({
          staff: s,
          items: Object.entries(plan.requests[s.id] ?? {})
            .filter(([d]) => dates.includes(d))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([d, req]) => ({ date: d, req, state: requestStatus(codeInfo(getCell(plan, s.id, d).code, data.settings), req.kind) })),
        }))
        .filter((r) => r.items.length > 0),
    [staff, plan, dates, data.settings],
  );
  const all = rows.flatMap((r) => r.items);
  const met = all.filter((i) => i.state === 'met').length;
  const unmet = all.filter((i) => i.state === 'unmet').length;
  const conflicts = useMemo(() => requestConflicts(data, plan), [data, plan]);

  const existing = plan.requests[person] ?? {};
  const offsUsed = offRequests(plan, person).filter((d) => dates.includes(d)).length;
  const toggle = (d: ISODate) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));

  const add = () => {
    if (!person || picked.length === 0) return;
    updatePlan((p) => {
      for (const d of picked) {
        setRequest(p, person, d, { kind, note: note.trim() || undefined });
        const cell = p.cells[person]?.[d];
        // A day off can't keep an automatic shift.
        if (kind === 'off' && cell && cell.code && !cell.locked) p.cells[person][d] = { code: '', source: 'request' };
      }
    });
    setPicked([]);
    setNote('');
  };

  const remove = (sid: string, d: ISODate) => updatePlan((p) => setRequest(p, sid, d, null));

  const reschedule = async () => {
    if (await confirmDialog(t.confirmGenerate)) void generate();
  };

  const lead = weekday(dates[0]);
  const nameOf = (id: string) => data.staff.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="screen">
      <div className="form-screen" style={{ maxWidth: 1180 }}>
        <div className="tiles">
          <div className="tile">
            <span className="tile-value">{all.length}</span>
            <span className="tile-label">{t.reqSummaryTotal}</span>
          </div>
          <div className="tile">
            <span className="tile-value" style={{ color: 'var(--ok)' }}>{met}</span>
            <span className="tile-label">{t.reqSummaryMet}</span>
          </div>
          <div className="tile">
            <span className="tile-value" style={{ color: unmet ? 'var(--bad)' : undefined }}>{unmet}</span>
            <span className="tile-label">{t.reqSummaryUnmet}</span>
          </div>
          <div className="tile">
            <span className="tile-value" style={{ color: conflicts.length ? 'var(--meh)' : undefined }}>{conflicts.length}</span>
            <span className="tile-label">{t.reqConflicts}</span>
          </div>
        </div>

        <div className="req-grid">
          <section className="card">
            <h2>{t.reqAddTitle}</h2>
            <p className="muted">{t.reqHelpRule}</p>
            <div className="field">
              {t.reqPerson}
              <div className="chips-row">
                {staff.map((s) => (
                  <button key={s.id} className={`pill ${person === s.id ? 'on' : ''}`} onClick={() => setPerson(s.id)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              {t.reqType}
              <div className="kind-seg">
                {KINDS.map((k) => (
                  <button key={k.id} className={`${k.id} ${kind === k.id ? 'on' : ''}`} onClick={() => setKind(k.id)}>
                    <Icon name={k.icon} size={17} />
                    {kindLabel(k.id)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>
                {t.reqDates} · <span className={offsUsed > maxOff ? 'bad-text' : ''}>{fill(t.reqOffLimit, { n: offsUsed, max: maxOff })}</span>
              </span>
              <div className="mini-cal">
                {t.weekdaysShort.map((w) => (
                  <div key={w} className="mc-h">{w}</div>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <div key={`b${i}`} />
                ))}
                {dates.map((d) => (
                  <button
                    key={d}
                    className={`mc-d ${picked.includes(d) ? 'on' : ''} ${plan.holidays.includes(d) ? 'holiday' : ''}`}
                    onClick={() => toggle(d)}
                    aria-pressed={picked.includes(d)}
                    title={existing[d] ? kindLabel(existing[d].kind) : undefined}
                  >
                    {Number(d.slice(8))}
                    {existing[d] ? <span className="mc-dot" /> : null}
                  </button>
                ))}
              </div>
              <span className="muted small">{t.reqPickDates}</span>
            </div>
            <label className="field">
              {t.reqNote}
              <input id="req-note" className="input" value={note} placeholder={t.reqNotePh} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn primary" onClick={add} disabled={picked.length === 0}>
                <Icon name="plus" size={17} />
                {picked.length ? fill(t.reqAddCount, { n: picked.length }) : t.reqAdd}
              </button>
            </div>
          </section>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <section className="card">
              <h2>{t.reqConflicts}</h2>
              {conflicts.length === 0 ? (
                <p className="ok-text" style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
                  <Icon name="check" size={17} />
                  {t.reqNoConflicts}
                </p>
              ) : (
                conflicts.map((c) => (
                  <div key={c.date} className="conflict">
                    <Icon name="alert" size={18} />
                    <div>
                      <b>{formatDate(t, c.date)}</b> —{' '}
                      {c.kind === 'managers'
                        ? fill(t.reqConflictManagers, { n: c.managersOff, total: c.managersTotal })
                        : fill(t.reqConflictStaff, { off: c.off, avail: c.available, need: c.need })}
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2 style={{ margin: 0 }}>{t.reqListTitle}</h2>
                {unmet > 0 ? (
                  <button className="btn small" onClick={reschedule} disabled={generating}>
                    <Icon name="sparkle" size={16} />
                    {generating ? t.generating : t.generate}
                  </button>
                ) : null}
              </div>
              {rows.length === 0 ? <p className="muted">{t.reqNone}</p> : null}
              <div className="req-list">
                {rows.map((r) => (
                  <div key={r.staff.id} className="req-person">
                    <div className="req-person-head">
                      <span className="pname">{nameOf(r.staff.id)}</span>
                      {r.staff.isManager ? <span className="tag mgr">M</span> : null}
                      {r.staff.partTime ? <span className="tag pt">PT</span> : null}
                    </div>
                    {r.items.map((i) => (
                      <div key={i.date} className="req-item">
                        <span>{formatDate(t, i.date)}</span>
                        <span className={`req-kind ${i.req.kind}`}>{kindLabel(i.req.kind)}</span>
                        <span className={`req-state ${i.state}`}>
                          {i.state === 'met' ? <Icon name="check" size={15} /> : i.state === 'unmet' ? <Icon name="alert" size={15} /> : null}
                          {i.state === 'met' ? t.reqMet : i.state === 'unmet' ? t.reqUnmet : t.reqOther}
                        </span>
                        <button className="icon-btn" onClick={() => remove(r.staff.id, i.date)} aria-label={t.delete}>
                          <Icon name="trash" size={17} />
                        </button>
                        {i.req.note ? <span className="req-note">{i.req.note}</span> : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
