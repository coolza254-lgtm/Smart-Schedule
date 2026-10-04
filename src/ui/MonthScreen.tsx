import { useState } from 'react';
import {
  minCloseFor,
  minOpenFor,
  monthDates,
  offDaysUsed,
  scheduledStaff,
  weekday,
  type ISODate,
} from '../engine';
import { formatDate, useT } from '../i18n';
import { useCurrentPlan, useStore } from '../store';

const EVENT_COLORS = ['', '#ff0000', '#9dc3e6', '#ffff00', '#92d050', '#ffc000', '#ffccff'];

export function MonthScreen() {
  const t = useT();
  const data = useStore((s) => s.data);
  const updatePlan = useStore((s) => s.updatePlan);
  const plan = useCurrentPlan();
  const staff = scheduledStaff(data);
  const dates = monthDates(plan.year, plan.month);
  const [reqFor, setReqFor] = useState<string | null>(null);
  const maxReq = data.settings.rules.maxRequestsPerPerson;

  const toggleRequest = (sid: string, d: ISODate) =>
    updatePlan((p) => {
      const set = new Set(p.requests[sid] ?? []);
      if (set.has(d)) set.delete(d);
      else {
        set.add(d);
        // A requested day off can't keep a shift.
        const c = p.cells[sid]?.[d];
        if (c && c.code) p.cells[sid][d] = { code: '', source: 'request' };
      }
      p.requests[sid] = [...set].sort();
    });

  const lead = weekday(dates[0]);

  return (
    <div className="screen form-screen">
      <section className="card">
        <h2>{t.offQuotaTitle}</h2>
        <p className="muted">{t.offQuotaHelp}</p>
        <p className="muted">{t.fixedHelp}</p>
        <div className="quota-list">
          {staff.map((s) => {
            const q = plan.offQuota[s.id] ?? s.defaultOffDays;
            const used = offDaysUsed(data, plan, s.id);
            return (
              <div key={s.id} className="quota-row">
                <span className="pname">
                  {s.name}
                  {s.isManager ? <span className="tag mgr">M</span> : null}
                  {s.partTime ? <span className="tag pt">PT</span> : null}
                </span>
                <div className="stepper">
                  <button onClick={() => updatePlan((p) => void (p.offQuota[s.id] = Math.max(0, q - 1)))}>−</button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={q}
                    min={0}
                    max={dates.length}
                    onChange={(e) => updatePlan((p) => void (p.offQuota[s.id] = Math.max(0, Math.min(dates.length, Number(e.target.value) || 0))))}
                  />
                  <button onClick={() => updatePlan((p) => void (p.offQuota[s.id] = Math.min(dates.length, q + 1)))}>+</button>
                </div>
                <span className={`muted small ${used !== q ? 'bad-text' : ''}`}>
                  {t.offDays}: {used}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>{t.requestsTitle}</h2>
        <p className="muted">{t.requestsHelp}</p>
        <div className="chips-row">
          {staff.map((s) => {
            const n = (plan.requests[s.id] ?? []).length;
            return (
              <button key={s.id} className={`pill ${reqFor === s.id ? 'on' : ''} ${n > maxReq ? 'bad' : ''}`} onClick={() => setReqFor(reqFor === s.id ? null : s.id)}>
                {s.name} {n ? <b>· {n}</b> : null}
              </button>
            );
          })}
        </div>
        {reqFor ? (
          <div className="mini-cal">
            {t.weekdaysShort.map((w) => (
              <div key={w} className="mc-h">{w}</div>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {dates.map((d) => {
              const on = (plan.requests[reqFor] ?? []).includes(d);
              return (
                <button key={d} className={`mc-d ${on ? 'on' : ''} ${plan.holidays.includes(d) ? 'holiday' : ''}`} onClick={() => toggleRequest(reqFor, d)}>
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>{t.daysTitle}</h2>
        <p className="muted">{t.daysHelp}</p>
        <div className="day-rows">
          {dates.map((d) => {
            const ev = plan.events[d] ?? { line1: '' };
            const holiday = plan.holidays.includes(d);
            const wd = weekday(d);
            const setEvent = (patch: Partial<typeof ev>) =>
              updatePlan((p) => {
                const next = { ...ev, ...patch };
                if (!next.line1 && !next.line2) delete p.events[d];
                else p.events[d] = next;
              });
            const setOverride = (key: 'minOpen' | 'minClose', v: string) =>
              updatePlan((p) => {
                const o = { ...(p.dayOverrides[d] ?? {}) };
                if (v === '') delete o[key];
                else o[key] = Math.max(0, Number(v));
                if (o.minOpen === undefined && o.minClose === undefined) delete p.dayOverrides[d];
                else p.dayOverrides[d] = o;
              });
            return (
              <div key={d} className={`day-row ${holiday ? 'holiday' : ''}`}>
                <div className={`dr-date ${wd === 5 ? 'sat' : wd === 6 ? 'sun' : ''}`}>{formatDate(t, d)}</div>
                <label className="check inline">
                  <input
                    type="checkbox"
                    checked={holiday}
                    onChange={(e) =>
                      updatePlan((p) => {
                        p.holidays = e.target.checked ? [...p.holidays, d].sort() : p.holidays.filter((x) => x !== d);
                      })
                    }
                  />
                  {t.holiday}
                </label>
                <input className="input ev-in" placeholder={t.eventLine1} value={ev.line1} onChange={(e) => setEvent({ line1: e.target.value })} />
                <input className="input ev-in" placeholder={t.eventLine2} value={ev.line2 ?? ''} onChange={(e) => setEvent({ line2: e.target.value })} />
                <div className="swatches" title={t.eventColor}>
                  {EVENT_COLORS.map((c) => (
                    <button
                      key={c || 'none'}
                      className={`sw ${((ev.color ?? '') === c) ? 'on' : ''}`}
                      style={{ background: c || 'transparent' }}
                      onClick={() => setEvent({ color: c || undefined })}
                      aria-label={c || 'none'}
                    >
                      {c ? '' : '∅'}
                    </button>
                  ))}
                </div>
                <label className="mini-num">
                  {t.minOpenOverride}
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={String(minOpenFor(data.settings, { ...plan, dayOverrides: {} }, d))}
                    value={plan.dayOverrides[d]?.minOpen ?? ''}
                    onChange={(e) => setOverride('minOpen', e.target.value)}
                  />
                </label>
                <label className="mini-num">
                  {t.minCloseOverride}
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={String(minCloseFor(data.settings, { ...plan, dayOverrides: {} }, d))}
                    value={plan.dayOverrides[d]?.minClose ?? ''}
                    onChange={(e) => setOverride('minClose', e.target.value)}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
