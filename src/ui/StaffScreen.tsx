import { useState } from 'react';
import type { Staff, Weekday } from '../engine';
import { useT } from '../i18n';
import { useStore } from '../store';
import { confirmDialog } from './Dialog';

export function StaffScreen() {
  const t = useT();
  const data = useStore((s) => s.data);
  const update = useStore((s) => s.update);
  const [editing, setEditing] = useState<Staff | null>(null);
  const sectionName = (id: string) => data.settings.sections.find((s) => s.id === id)?.name ?? id;

  const move = (i: number, dir: -1 | 1) =>
    update((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.staff.length) return;
      [d.staff[i], d.staff[j]] = [d.staff[j], d.staff[i]];
    });

  const addNew = () =>
    setEditing({
      id: `S${Date.now().toString(36).toUpperCase()}`,
      name: '',
      sections: [data.settings.sections[0]?.id].filter(Boolean) as string[],
      isManager: false,
      partTime: false,
      active: true,
      canMorning: true,
      canEvening: true,
      unavailableWeekdays: [],
      defaultOffDays: 10,
    });

  return (
    <div className="screen form-screen">
      <section className="card">
        <div className="card-head">
          <h2>{t.tabStaff} <span className="muted">({data.staff.filter((s) => s.active).length} {t.staffCount})</span></h2>
          <button className="btn primary" onClick={addNew}>+ {t.addStaff}</button>
        </div>
        <div className="staff-list">
          {data.staff.map((s, i) => (
            <div key={s.id} className={`staff-row ${s.active ? '' : 'inactive'}`}>
              <div className="order">
                <button className="icon-btn" onClick={() => move(i, -1)} aria-label={t.moveUp}>▲</button>
                <button className="icon-btn" onClick={() => move(i, 1)} aria-label={t.moveDown}>▼</button>
              </div>
              <button className="staff-main" onClick={() => setEditing(structuredClone(s))}>
                <span className="pname">{s.name}</span>
                <span className="tags">
                  {s.isManager ? <span className="tag mgr">M</span> : null}
                  <span className={`tag ${s.partTime ? 'pt' : 'ft'}`}>{s.partTime ? t.partTime : t.fullTime}</span>
                  {s.sections.map((id) => (
                    <span key={id} className="tag sec">{sectionName(id)}</span>
                  ))}
                  {!s.canMorning ? <span className="tag warn">✕ {t.morning}</span> : null}
                  {!s.canEvening ? <span className="tag warn">✕ {t.evening}</span> : null}
                  {s.preferredShift ? <span className="tag">♥ {s.preferredShift === 'morning' ? t.morning : t.evening}</span> : null}
                </span>
              </button>
            </div>
          ))}
        </div>
      </section>
      {editing ? <StaffEditor staff={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function StaffEditor({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const t = useT();
  const data = useStore((s) => s.data);
  const update = useStore((s) => s.update);
  const [s, setS] = useState<Staff>(staff);
  const isNew = !data.staff.some((x) => x.id === staff.id);
  const patch = (p: Partial<Staff>) => setS((prev) => ({ ...prev, ...p }));

  const save = () => {
    if (!s.name.trim()) return;
    const clean: Staff = {
      ...s,
      name: s.name.trim().toUpperCase(),
      morningCode: s.morningCode?.trim().toUpperCase() || undefined,
      eveningCode: s.eveningCode?.trim().toUpperCase() || undefined,
    };
    update((d) => {
      const i = d.staff.findIndex((x) => x.id === clean.id);
      if (i >= 0) d.staff[i] = clean;
      else d.staff.push(clean);
    });
    onClose();
  };

  const remove = async () => {
    if (!(await confirmDialog(t.confirmDelete, { danger: true }))) return;
    update((d) => {
      d.staff = d.staff.filter((x) => x.id !== s.id);
    });
    onClose();
  };

  const toggleDay = (wd: Weekday) =>
    patch({ unavailableWeekdays: s.unavailableWeekdays.includes(wd) ? s.unavailableWeekdays.filter((x) => x !== wd) : [...s.unavailableWeekdays, wd].sort() });

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="sheet-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="modal-head">
          <div className="modal-title">{s.name || t.addStaff}</div>
          <button className="icon-btn" onClick={onClose} aria-label={t.close_}>✕</button>
        </div>
        <label className="field">
          {t.name}
          <input className="input" value={s.name} onChange={(e) => patch({ name: e.target.value })} autoFocus={isNew} />
        </label>
        <div className="field">
          {t.sections}
          <div className="chips-row">
            {data.settings.sections.map((sec) => (
              <button
                key={sec.id}
                className={`pill ${s.sections.includes(sec.id) ? 'on' : ''}`}
                onClick={() => patch({ sections: s.sections.includes(sec.id) ? s.sections.filter((x) => x !== sec.id) : [...s.sections, sec.id] })}
              >
                {sec.name}
              </button>
            ))}
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={s.isManager} onChange={(e) => patch({ isManager: e.target.checked })} />{t.isManager}</label>
        <label className="check"><input type="checkbox" checked={s.partTime} onChange={(e) => patch({ partTime: e.target.checked })} />{t.isPartTime}</label>
        <label className="check"><input type="checkbox" checked={s.canMorning} onChange={(e) => patch({ canMorning: e.target.checked })} />{t.canMorning}</label>
        <label className="check"><input type="checkbox" checked={s.canEvening} onChange={(e) => patch({ canEvening: e.target.checked })} />{t.canEvening}</label>
        <label className="field">
          {t.preferredShift}
          <select className="input" value={s.preferredShift ?? ''} onChange={(e) => patch({ preferredShift: (e.target.value || undefined) as Staff['preferredShift'] })}>
            <option value="">{t.noPreference}</option>
            <option value="morning">{t.morning}</option>
            <option value="evening">{t.evening}</option>
          </select>
        </label>
        <div className="field">
          {t.unavailableDays}
          <div className="chips-row">
            {t.weekdaysShort.map((w, i) => (
              <button key={w} className={`pill ${s.unavailableWeekdays.includes(i as Weekday) ? 'on bad' : ''}`} onClick={() => toggleDay(i as Weekday)}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="two">
          <label className="field">
            {t.morningCode}
            <input className="input" placeholder={t.sameAsStore} value={s.morningCode ?? ''} onChange={(e) => patch({ morningCode: e.target.value })} />
          </label>
          <label className="field">
            {t.eveningCode}
            <input className="input" placeholder={t.sameAsStore} value={s.eveningCode ?? ''} onChange={(e) => patch({ eveningCode: e.target.value })} />
          </label>
        </div>
        <label className="field">
          {t.defaultOffDays}
          <input className="input" type="number" inputMode="numeric" value={s.defaultOffDays} onChange={(e) => patch({ defaultOffDays: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label className="check"><input type="checkbox" checked={s.active} onChange={(e) => patch({ active: e.target.checked })} />{t.active}</label>
        <div className="modal-actions">
          {!isNew ? <button className="btn danger" onClick={remove}>{t.delete}</button> : null}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{t.cancel}</button>
          <button className="btn primary" onClick={save} disabled={!s.name.trim()}>{t.save}</button>
        </div>
      </div>
    </div>
  );
}
