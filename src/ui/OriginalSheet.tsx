import { Fragment } from 'react';
import {
  codeInfo,
  dayCoverage,
  getCell,
  groupHours,
  hoursOf,
  isInMonth,
  sheetGroups,
  weekday,
  weekLabel,
  weeksOf,
  type AppData,
  type ISODate,
  type Issue,
  type MonthPlan,
} from '../engine';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const SHEET_COLORS = {
  title: '#ffff00',
  holiday: '#ffccff',
  training: '#00b0f0',
  carry: '#d9d9d9',
  total: '#ccffcc',
  wedClose: '#ffc000',
  sat: '#0070c0',
  sun: '#ff0000',
};

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Props {
  data: AppData;
  plan: MonthPlan;
  issues?: Issue[];
  onCellClick?: (staffId: string, date: ISODate) => void;
}

/** A faithful copy of the store's Excel shift sheet. */
export function OriginalSheet({ data, plan, issues = [], onCellClick }: Props) {
  const weeks = weeksOf(plan.year, plan.month);
  const groups = sheetGroups(data);
  const offset = data.settings.weekNumberOffset;
  const flagged = new Set(issues.filter((i) => i.severity === 'error').map((i) => `${i.staffId ?? ''}|${i.date ?? ''}`));
  const dayFlag = (d: ISODate) => flagged.has(`|${d}`);

  const dateStyle = (d: ISODate): React.CSSProperties => {
    const ev = plan.events[d];
    if (ev?.color) return { background: ev.color, color: '#000' };
    if (plan.holidays.includes(d)) return { background: SHEET_COLORS.holiday };
    return {};
  };

  return (
    <div className="sheet">
      <div className="sheet-stamp">出力日：{stamp()}</div>
      <div className="sheet-title">
        <span className="sheet-store">{data.settings.storeName}</span>
        <span className="sheet-small">year</span>
        <span className="sheet-big">{plan.year}</span>
        <span className="sheet-small">month</span>
        <span className="sheet-month">{MONTHS_EN[plan.month - 1]}</span>
      </div>
      <table className="sheet-table">
        <colgroup>
          <col className="c-label" />
          {weeks.map((w, wi) => (
            <Fragment key={wi}>
              {w.map((d) => (
                <col key={d} className="c-day" />
              ))}
              <col className="c-total" />
            </Fragment>
          ))}
        </colgroup>
        <tbody>
          <tr>
            <th className="lbl center">週</th>
            {weeks.map((w, wi) => (
              <Fragment key={wi}>
                <td colSpan={w.length} className="center">{weekLabel(w[0], offset)}</td>
                <td className="center wk-end">total</td>
              </Fragment>
            ))}
          </tr>
          <tr>
            <th className="lbl center">日付</th>
            {weeks.map((w, wi) => (
              <Fragment key={wi}>
                {w.map((d) => (
                  <td key={d} className="center" style={dateStyle(d)}>{Number(d.slice(8))}</td>
                ))}
                <td className="wk-end" />
              </Fragment>
            ))}
          </tr>
          <tr>
            <th className="lbl center">曜日</th>
            {weeks.map((w, wi) => (
              <Fragment key={wi}>
                {w.map((d) => {
                  const wd = weekday(d);
                  const style = { ...dateStyle(d), ...(wd === 5 ? { color: SHEET_COLORS.sat } : wd === 6 ? { color: SHEET_COLORS.sun } : {}) };
                  return (
                    <td key={d} className="center" style={style}>{WD_EN[wd]}</td>
                  );
                })}
                <td className="wk-end" />
              </Fragment>
            ))}
          </tr>
          {[0, 1].map((line) => (
            <tr key={line}>
              <th className="lbl">DAILY SCHEDULE</th>
              {weeks.map((w, wi) => (
                <Fragment key={wi}>
                  {w.map((d) => {
                    const ev = plan.events[d];
                    const text = line === 0 ? ev?.line1 : ev?.line2;
                    return (
                      <td key={d} className="ev" style={ev?.color && text ? { background: ev.color } : undefined}>{text}</td>
                    );
                  })}
                  <td className="wk-end" />
                </Fragment>
              ))}
            </tr>
          ))}
          {(['open', 'close'] as const).map((kind) => (
            <tr key={kind} className={kind === 'open' ? 'thick-top' : 'thick-bottom'}>
              <th className="lbl center">{kind.toUpperCase()}</th>
              {weeks.map((w, wi) => (
                <Fragment key={wi}>
                  {w.map((d) => {
                    const c = dayCoverage(data, plan, d);
                    const v = kind === 'open' ? c.open : c.close;
                    const short = kind === 'open' ? c.open < c.minOpen || c.managerOpen === 0 : c.close < c.minClose || c.managerClose === 0;
                    const wed = kind === 'close' && weekday(d) === 2;
                    return (
                      <td
                        key={d}
                        className={`center ${isInMonth(d, plan.year, plan.month) && short && dayFlag(d) ? 'flag' : ''}`}
                        style={wed ? { background: SHEET_COLORS.wedClose } : undefined}
                      >
                        {v}
                      </td>
                    );
                  })}
                  <td className="center wk-end">—</td>
                </Fragment>
              ))}
            </tr>
          ))}
          {groups.map((g) => (
            <Fragment key={g.id}>
              {g.people.map((s) => (
                <tr key={s.id}>
                  <th className="lbl">{s.name}</th>
                  {weeks.map((w, wi) => (
                    <Fragment key={wi}>
                      {w.map((d) => {
                        const cell = getCell(plan, s.id, d);
                        const info = codeInfo(cell.code, data.settings);
                        const carry = !isInMonth(d, plan.year, plan.month);
                        const style: React.CSSProperties = {};
                        if (info.kind === 'training') style.background = SHEET_COLORS.training;
                        else if (carry) style.background = SHEET_COLORS.carry;
                        return (
                          <td
                            key={d}
                            className={`center code ${onCellClick ? 'tap' : ''} ${flagged.has(`${s.id}|${d}`) ? 'flag' : ''}`}
                            style={style}
                            onClick={onCellClick ? () => onCellClick(s.id, d) : undefined}
                          >
                            {cell.code}
                          </td>
                        );
                      })}
                      <td className="num wk-end">{hoursOf(data, plan, s.id, w)}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
              <tr className="grp-total">
                <th className="lbl">{g.label} total</th>
                {weeks.map((w, wi) => (
                  <Fragment key={wi}>
                    {w.map((d) => (
                      <td key={d} className="center">{groupHours(data, plan, g.people, d)}</td>
                    ))}
                    <td className="num wk-end">{w.reduce((sum, d) => sum + groupHours(data, plan, g.people, d), 0)}</td>
                  </Fragment>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
