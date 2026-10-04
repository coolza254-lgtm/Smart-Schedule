import {
  codeInfo,
  dayCoverage,
  getCell,
  isInMonth,
  minutesToHHMM,
  monthDates,
  personStats,
  scheduledStaff,
  weekday,
  windowDates,
  type AppData,
  type CodeInfo,
  type ISODate,
  type Issue,
  type MonthPlan,
} from '../engine';
import { formatDate, issueText, useT, type T } from '../i18n';

export type ChipKind = 'morning' | 'evening' | 'mid' | 'training' | 'leave' | 'off' | 'unknown';

export function chipKind(info: CodeInfo): ChipKind {
  if (info.kind === 'training') return 'training';
  if (info.kind === 'leave') return 'leave';
  if (info.kind === 'off') return 'off';
  if (info.kind === 'unknown') return 'unknown';
  if (info.opens) return 'morning';
  if (info.closes) return 'evening';
  return 'mid';
}

export function chipText(code: string, info: CodeInfo): { main: string; sub?: string } {
  if (info.shift) return { main: minutesToHHMM(info.shift.start), sub: minutesToHHMM(info.shift.end) };
  if (info.kind === 'training') return { main: 'TR', sub: info.branch };
  return { main: code };
}

interface Props {
  data: AppData;
  plan: MonthPlan;
  issues: Issue[];
  mode: 'table' | 'days';
  onCellClick?: (staffId: string, date: ISODate) => void;
  /** Render every column (for PDF export) instead of only the month. */
  includeCarry?: boolean;
}

export function EasyView(props: Props) {
  return props.mode === 'table' ? <EasyTable {...props} /> : <EasyDays {...props} />;
}

function CoverageBadge({ value, min, target, label, managerMissing }: { value: number; min: number; target: number; label: string; managerMissing: boolean }) {
  const cls = value < min || managerMissing ? 'bad' : value < target ? 'meh' : 'ok';
  return (
    <span className={`cov ${cls}`} title={label}>
      {label === 'open' ? '☀' : '☾'}
      {value}
      {managerMissing ? '!' : ''}
    </span>
  );
}

function EasyTable({ data, plan, issues, onCellClick, includeCarry }: Props) {
  const t = useT();
  const staff = scheduledStaff(data);
  const dates = includeCarry ? windowDates(plan.year, plan.month) : monthDates(plan.year, plan.month);
  const flagged = new Set(issues.map((i) => `${i.staffId ?? ''}|${i.date ?? ''}`));
  const requested = (sid: string, d: ISODate) => (plan.requests[sid] ?? []).includes(d);

  return (
    <div className="easy-table-wrap">
      <table className="easy-table">
        <thead>
          <tr>
            <th className="sticky-col corner small">
              <div className="muted">☀ {t.open}</div>
              <div className="muted">☾ {t.close}</div>
            </th>
            {dates.map((d) => {
              const wd = weekday(d);
              const holiday = plan.holidays.includes(d);
              const ev = plan.events[d];
              const cov = dayCoverage(data, plan, d);
              return (
                <th key={d} className={`day-h ${wd >= 5 ? 'weekend' : ''} ${holiday ? 'holiday' : ''} ${!isInMonth(d, plan.year, plan.month) ? 'carry' : ''}`}>
                  <div className="dnum">{Number(d.slice(8))}</div>
                  <div className="dwd">{t.weekdaysShort[wd]}</div>
                  {ev?.line1 ? <div className="dev" style={{ background: ev.color || undefined }} title={[ev.line1, ev.line2].filter(Boolean).join(' ')}>{ev.line1}</div> : null}
                  <div className="cov-stack">
                    <CoverageBadge value={cov.open} min={cov.minOpen} target={cov.targetOpen} label="open" managerMissing={cov.managerOpen === 0} />
                    <CoverageBadge value={cov.close} min={cov.minClose} target={cov.targetClose} label="close" managerMissing={cov.managerClose === 0} />
                  </div>
                </th>
              );
            })}
            <th className="sum-h">{t.workDays}</th>
            <th className="sum-h">{t.offDays}</th>
            <th className="sum-h">{t.hours}</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => {
            const st = personStats(data, plan, s.id);
            const quota = plan.offQuota[s.id];
            return (
              <tr key={s.id}>
                <th className="sticky-col name-cell">
                  <span className="pname">{s.name}</span>
                  <span className="tags">
                    {s.isManager ? <span className="tag mgr">M</span> : null}
                    {s.partTime ? <span className="tag pt">PT</span> : null}
                  </span>
                </th>
                {dates.map((d) => {
                  const cell = getCell(plan, s.id, d);
                  const info = codeInfo(cell.code, data.settings);
                  const kind = chipKind(info);
                  const txt = chipText(cell.code, info);
                  const carry = !isInMonth(d, plan.year, plan.month);
                  return (
                    <td
                      key={d}
                      className={`ecell ${carry ? 'carry' : ''} ${flagged.has(`${s.id}|${d}`) ? 'flag' : ''} ${onCellClick ? 'tap' : ''}`}
                      onClick={onCellClick ? () => onCellClick(s.id, d) : undefined}
                      title={cell.code}
                    >
                      {kind === 'off' ? (
                        requested(s.id, d) ? <span className="req">R</span> : null
                      ) : (
                        <span className={`chip ${kind}`}>
                          <b>{txt.main}</b>
                          {txt.sub ? <small>{txt.sub}</small> : null}
                        </span>
                      )}
                      {cell.locked && !carry ? <span className="lock">•</span> : null}
                    </td>
                  );
                })}
                <td className="sum">{st.workDays}</td>
                <td className={`sum ${quota !== undefined && st.offDays !== quota ? 'bad-text' : ''}`}>
                  {st.offDays}
                  {quota !== undefined ? <small>/{quota}</small> : null}
                </td>
                <td className="sum">{st.hours}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Legend t={t} />
    </div>
  );
}

export function Legend({ t }: { t: T }) {
  return (
    <div className="legend">
      <span className="chip morning"><b>{t.morning}</b></span>
      <span className="chip evening"><b>{t.evening}</b></span>
      <span className="chip training"><b>{t.training}</b></span>
      <span className="chip leave"><b>{t.leave}</b></span>
      <span className="req">R</span> {t.requestedOff}
      <span className="lock">•</span> 🔒
      <span className="cov ok">☀ {t.open}</span>
      <span className="cov ok">☾ {t.close}</span>
    </div>
  );
}

function EasyDays({ data, plan, issues, onCellClick }: Props) {
  const t = useT();
  const staff = scheduledStaff(data);
  return (
    <div className="days">
      {monthDates(plan.year, plan.month).map((d) => {
        const c = dayCoverage(data, plan, d);
        const ev = plan.events[d];
        const holiday = plan.holidays.includes(d);
        const groups: Record<'morning' | 'evening' | 'mid' | 'away' | 'off', { id: string; name: string; code: string; info: CodeInfo; mgr: boolean; locked?: boolean }[]> = {
          morning: [],
          evening: [],
          mid: [],
          away: [],
          off: [],
        };
        for (const s of staff) {
          const cell = getCell(plan, s.id, d);
          const info = codeInfo(cell.code, data.settings);
          const k = chipKind(info);
          const entry = { id: s.id, name: s.name, code: cell.code, info, mgr: s.isManager, locked: cell.locked };
          if (k === 'morning') groups.morning.push(entry);
          else if (k === 'evening') groups.evening.push(entry);
          else if (k === 'mid') groups.mid.push(entry);
          else if (k === 'off') groups.off.push(entry);
          else groups.away.push(entry);
        }
        const dayIssues = issues.filter((i) => i.date === d);
        const wd = weekday(d);
        return (
          <section key={d} className={`day-card ${holiday ? 'holiday' : ''} ${dayIssues.some((i) => i.severity === 'error') ? 'has-error' : ''}`}>
            <header>
              <div className={`day-title ${wd === 5 ? 'sat' : wd === 6 ? 'sun' : ''}`}>{formatDate(t, d)}</div>
              <div className="day-badges">
                {holiday ? <span className="badge holiday">{t.holiday}</span> : null}
                {ev?.line1 ? <span className="badge event" style={{ background: ev.color || undefined }}>{[ev.line1, ev.line2].filter(Boolean).join(' ')}</span> : null}
                <CoverageBadge value={c.open} min={c.minOpen} target={c.targetOpen} label="open" managerMissing={c.managerOpen === 0} />
                <CoverageBadge value={c.close} min={c.minClose} target={c.targetClose} label="close" managerMissing={c.managerClose === 0} />
              </div>
            </header>
            {(['morning', 'mid', 'evening', 'away'] as const).map((g) =>
              groups[g].length ? (
                <div key={g} className={`lane ${g}`}>
                  <div className="lane-label">{g === 'morning' ? t.morning : g === 'evening' ? t.evening : g === 'away' ? `${t.training} / ${t.leave}` : ''}</div>
                  <div className="lane-people">
                    {groups[g].map((p) => (
                      <button key={p.id} className={`person ${chipKind(p.info)}`} onClick={onCellClick ? () => onCellClick(p.id, d) : undefined}>
                        <span className="pn">{p.name}{p.mgr ? <sup>M</sup> : null}</span>
                        <span className="pc">{p.info.shift ? `${minutesToHHMM(p.info.shift.start)}–${minutesToHHMM(p.info.shift.end)}` : p.code}</span>
                        {p.locked ? <span className="lock">•</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
            {groups.off.length ? (
              <div className="lane off">
                <div className="lane-label">{t.off}</div>
                <div className="lane-people">
                  {groups.off.map((p) => (
                    <button key={p.id} className="person off" onClick={onCellClick ? () => onCellClick(p.id, d) : undefined}>
                      <span className="pn">{p.name}</span>
                      {(plan.requests[p.id] ?? []).includes(d) ? <span className="req">R</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {dayIssues.length ? (
              <ul className="day-issues">
                {dayIssues.map((i, k) => (
                  <li key={k} className={i.severity}>
                    {i.staffId ? <b>{data.staff.find((s) => s.id === i.staffId)?.name}: </b> : null}
                    {issueText(t, i)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
