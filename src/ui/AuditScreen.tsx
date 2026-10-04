import { useMemo, useState } from 'react';
import { audit, auditPlans, type AuditFinding, type AuditMetric, type AuditStatus, type MetricId, type PersonAudit } from '../engine';
import { fill, useT, type T } from '../i18n';
import { useStore } from '../store';
import { confirmDialog } from './Dialog';
import { Icon } from './Icon';

const STATUS_COLOR: Record<AuditStatus, string> = { good: 'var(--ok)', watch: '#d9a441', unfair: 'var(--bad)' };

function StatusChip({ t, status }: { t: T; status: AuditStatus }) {
  const label = status === 'good' ? t.auditStatus_good : status === 'watch' ? t.auditStatus_watch : t.auditStatus_unfair;
  return (
    <span className={`status-chip ${status}`}>
      <Icon name={status === 'good' ? 'check' : 'alert'} size={13} />
      {label}
    </span>
  );
}

function ScoreRing({ score, status, label }: { score: number; status: AuditStatus; label: string }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  return (
    <div className="score-ring" role="img" aria-label={`${label} ${score}/100`}>
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle cx="66" cy="66" r={r} fill="none" stroke={STATUS_COLOR[status]} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * score) / 100} ${c}`} />
      </svg>
      <div className="score-num">
        <b>{score}</b>
        <span>/ 100</span>
      </div>
    </div>
  );
}

interface Tip {
  x: number;
  y: number;
  text: string;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bind = (text: string) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX + 12, y: e.clientY + 12, text }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  ) : null;
  return { bind, node };
}

export function AuditScreen() {
  const t = useT();
  const data = useStore((s) => s.data);
  const year = useStore((s) => s.year);
  const month = useStore((s) => s.month);
  const generate = useStore((s) => s.generate);
  const generating = useStore((s) => s.generating);
  const [span, setSpan] = useState<1 | 3>(1);
  const report = useMemo(() => audit(data, auditPlans(data, year, month, span)), [data, year, month, span]);
  const { bind, node: tipNode } = useTip();

  const metricName = (id: MetricId) => t[`metric_${id}` as const];
  const metricDesc = (id: MetricId) => t[`metric_${id}_d` as const];
  const findingText = (f: AuditFinding) => fill(t[`find_${f.kind}` as const], f.params);
  const monthsLabel = report.months.map((k) => `${t.months[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`).join(', ');

  const rebalance = async () => {
    if (await confirmDialog(t.confirmGenerate)) void generate();
  };

  const people = report.people;
  const maxWeekend = Math.max(1, ...people.map((p) => Math.max(p.weekendWorked, p.expected.weekend)));
  const maxShifts = Math.max(1, ...people.map((p) => p.mornings + p.evenings));
  const counts = { unfair: report.findings.filter((f) => f.status === 'unfair').length, watch: report.findings.filter((f) => f.status === 'watch').length };

  const dev = (actual: number, expected: number) => {
    const d = actual - expected;
    return d > 1 ? 'hi' : d < -1 ? 'lo' : '';
  };

  return (
    <div className="screen">
      <div className="form-screen" style={{ maxWidth: 1180 }}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <div className="seg">
            <button className={span === 1 ? 'on' : ''} onClick={() => setSpan(1)}>{t.auditPeriod1}</button>
            <button className={span === 3 ? 'on' : ''} onClick={() => setSpan(3)}>{t.auditPeriod3}</button>
          </div>
          <span className="muted small">{fill(t.auditMonthsIncluded, { list: monthsLabel })}</span>
          <div className="spacer" />
          <button className="btn primary" onClick={rebalance} disabled={generating}>
            <Icon name="sparkle" size={17} />
            {generating ? t.generating : t.auditRebalance}
          </button>
        </div>

        <section className="card">
          <div className="audit-hero">
            <ScoreRing score={report.score} status={report.status} label={t.auditScore} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <span className="overline">{t.auditScore}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusChip t={t} status={report.status} />
                <span className="muted small">
                  {t.auditFullTime}: {people.map((p) => p.staff.name).join(', ')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {counts.unfair ? <span className="status-chip unfair">{counts.unfair} × {t.auditStatus_unfair}</span> : null}
                {counts.watch ? <span className="status-chip watch">{counts.watch} × {t.auditStatus_watch}</span> : null}
                {!counts.unfair && !counts.watch ? <span className="ok-text">{t.auditNoFindings}</span> : null}
              </div>
            </div>
          </div>
        </section>

        <div className="metric-grid">
          {report.metrics.map((m: AuditMetric) => (
            <section key={m.id} className={`metric ${m.applicable ? m.status : ''}`}>
              <div className="metric-top">
                <span className="metric-name">{metricName(m.id)}</span>
                {m.applicable ? <StatusChip t={t} status={m.status} /> : <span className="status-chip na">{t.auditNA}</span>}
              </div>
              <div className="metric-top">
                <span className="metric-score">{m.applicable ? m.score : '—'}</span>
                {m.applicable ? <span className="muted small">{fill(t.auditMaxDev, { n: m.maxDeviation })}</span> : null}
              </div>
              <div className="metric-bar">
                <i style={{ width: `${m.applicable ? m.score : 0}%`, background: m.applicable ? STATUS_COLOR[m.status] : undefined }} />
              </div>
              <p className="metric-desc">{metricDesc(m.id)}</p>
            </section>
          ))}
        </div>

        <section className="card">
          <h2>{t.auditFindings}</h2>
          {report.findings.length === 0 ? (
            <p className="ok-text" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Icon name="check" size={17} />
              {t.auditNoFindings}
            </p>
          ) : (
            <ul className="findings">
              {report.findings.map((f, i) => (
                <li key={i}>
                  <StatusChip t={t} status={f.status} />
                  <span>
                    <span className="muted small">{metricName(f.metric)} · </span>
                    {findingText(f)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="chart-row">
          <section className="card">
            <h3 className="chart-title">{t.chartWeekend}</h3>
            <div className="chart-legend">
              <span>
                <i style={{ background: 'var(--brand-2)' }} />
                {t.colWeekend}
              </span>
              <span>
                <i className="tick" />
                {t.chartFair}
              </span>
            </div>
            <div className="hbars">
              {people.map((p) => (
                <div key={p.staff.id} className="hbar" {...bind(`${p.staff.name}: ${p.weekendWorked} / ${t.chartFair} ${p.expected.weekend}`)}>
                  <span className="hbar-name">{p.staff.name}</span>
                  <div className="hbar-track">
                    <div className="seg-fill" style={{ width: `${(p.weekendWorked / maxWeekend) * 100}%`, background: 'var(--brand-2)' }} />
                    <span className="fair-tick" style={{ left: `calc(${(p.expected.weekend / maxWeekend) * 100}% - 1px)` }} />
                  </div>
                  <span className="hbar-val">
                    <b>{p.weekendWorked}</b> / {p.expected.weekend}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <h3 className="chart-title">{t.chartMix}</h3>
            <div className="chart-legend">
              <span>
                <i style={{ background: 'var(--morning-mark)' }} />
                {t.morning}
              </span>
              <span>
                <i style={{ background: 'var(--evening-mark)' }} />
                {t.evening}
              </span>
            </div>
            <div className="hbars">
              {people.map((p) => (
                <div key={p.staff.id} className="hbar" {...bind(`${p.staff.name}: ${t.morning} ${p.mornings} · ${t.evening} ${p.evenings}`)}>
                  <span className="hbar-name">{p.staff.name}</span>
                  <div className="hbar-track">
                    {p.mornings ? <div className="seg-fill" style={{ width: `${(p.mornings / maxShifts) * 100}%`, background: 'var(--morning-mark)' }} /> : null}
                    {p.evenings ? <div className="seg-fill" style={{ width: `${(p.evenings / maxShifts) * 100}%`, background: 'var(--evening-mark)' }} /> : null}
                  </div>
                  <span className="hbar-val">
                    <b>{p.mornings}</b> · <b>{p.evenings}</b>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="card">
          <div className="table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>{t.colPerson}</th>
                  <th>{t.colWork}</th>
                  <th>{t.colOff}</th>
                  <th>{t.colMorning}</th>
                  <th>{t.colEvening}</th>
                  <th>
                    {t.colWeekend}
                    <br />
                    <span className="muted">({t.colExpected})</span>
                  </th>
                  <th>{t.colWeekendsOff}</th>
                  <th>{t.colHoliday}</th>
                  <th>{t.colHeavy}</th>
                  <th>{t.colStreak}</th>
                  <th>{t.colWeekHours}</th>
                  <th>{t.colRequests}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={12} className="overline" style={{ paddingTop: 12 }}>{t.auditFullTime}</td>
                </tr>
                {people.map((p) => (
                  <PersonRow key={p.staff.id} p={p} dev={dev} scored />
                ))}
                {report.partTime.length ? (
                  <tr>
                    <td colSpan={12} className="overline" style={{ paddingTop: 16 }}>{t.auditPartTime}</td>
                  </tr>
                ) : null}
                {report.partTime.map((p) => (
                  <PersonRow key={p.staff.id} p={p} dev={dev} scored={false} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {tipNode}
    </div>
  );
}

function PersonRow({ p, dev, scored }: { p: PersonAudit; dev: (a: number, e: number) => string; scored: boolean }) {
  const cls = (a: number, e: number) => (scored ? dev(a, e) : '');
  const mix = scored && !p.staff.preferredShift ? Math.abs(p.mornings - p.evenings) > 4 : false;
  return (
    <tr className={scored ? '' : 'pt'}>
      <td>
        <b>{p.staff.name}</b> {p.staff.isManager ? <span className="tag mgr">M</span> : null}
      </td>
      <td className={cls(p.workDays, p.expected.workDays)}>{p.workDays}</td>
      <td>
        {p.offDays}
        <small>/ {p.quota}</small>
      </td>
      <td className={mix && p.mornings > p.evenings ? 'hi' : ''}>{p.mornings}</td>
      <td className={mix && p.evenings > p.mornings ? 'hi' : ''}>{p.evenings}</td>
      <td className={cls(p.weekendWorked, p.expected.weekend)}>
        {p.weekendWorked}
        {scored ? <small>({p.expected.weekend})</small> : null}
      </td>
      <td>{p.weekendsOff}</td>
      <td className={cls(p.holidayWorked, p.expected.holiday)}>
        {p.holidayWorked}
        {scored ? <small>({p.expected.holiday})</small> : null}
      </td>
      <td className={cls(p.heavy, p.expected.heavy)}>
        {p.heavy}
        {scored ? <small>({p.expected.heavy})</small> : null}
      </td>
      <td>{p.longestStreak}</td>
      <td>{p.weekHoursMax ? `${p.weekHoursMin}–${p.weekHoursMax}` : '—'}</td>
      <td>{p.requestsTotal ? `${p.requestsMet}/${p.requestsTotal}` : '—'}</td>
    </tr>
  );
}
