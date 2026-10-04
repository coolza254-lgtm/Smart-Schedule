import { useRef } from 'react';
import { defaultAppData, type AppData, type Rules, type Weekday } from '../engine';
import { LANGS, useT } from '../i18n';
import { useStore } from '../store';
import { download } from '../export/download';
import { alertDialog, confirmDialog } from './Dialog';

export function SettingsScreen() {
  const t = useT();
  const data = useStore((s) => s.data);
  const update = useStore((s) => s.update);
  const replaceData = useStore((s) => s.replaceData);
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = data.settings;
  const r = st.rules;

  const setRule = <K extends keyof Rules>(k: K, v: Rules[K]) => update((d) => void (d.settings.rules[k] = v));
  const setPerDay = (k: 'minOpen' | 'minClose' | 'targetOpen' | 'targetClose', i: number, v: number) =>
    update((d) => void (d.settings.rules[k][i] = Math.max(0, v || 0)));
  const setByDay = (k: 'morningByWeekday' | 'eveningByWeekday', i: Weekday, v: string) =>
    update((d) => {
      const map = d.settings.shifts[k];
      if (v.trim()) map[i] = v.trim().toUpperCase();
      else delete map[i];
    });

  const backup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    void download(blob, `smart-schedule-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const restore = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as AppData;
      if (parsed.version !== 1 || !Array.isArray(parsed.staff) || !parsed.settings || !parsed.plans) throw new Error('bad');
      replaceData(parsed);
    } catch {
      void alertDialog(t.restoreFailed);
    }
  };

  return (
    <div className="screen form-screen">
      <section className="card">
        <h2>{t.language}</h2>
        <div className="seg">
          {LANGS.map((l) => (
            <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)}>{l.label}</button>
          ))}
        </div>
        <p className="muted">{t.installHint}</p>
      </section>

      <section className="card">
        <h2>{t.storeSection}</h2>
        <label className="field">{t.storeName}<input className="input" value={st.storeName} onChange={(e) => update((d) => void (d.settings.storeName = e.target.value))} /></label>
        <div className="two">
          <label className="field">{t.storeOpen}<input className="input" type="time" value={st.storeOpen} onChange={(e) => update((d) => void (d.settings.storeOpen = e.target.value))} /></label>
          <label className="field">{t.storeClose}<input className="input" type="time" value={st.storeClose} onChange={(e) => update((d) => void (d.settings.storeClose = e.target.value))} /></label>
        </div>
        <label className="field">{t.weekOffset}<input className="input" type="number" value={st.weekNumberOffset} onChange={(e) => update((d) => void (d.settings.weekNumberOffset = Number(e.target.value) || 0))} /></label>
        <div className="field">
          {t.sections}
          <div className="list-edit">
            {st.sections.map((sec, i) => (
              <div key={i} className="le-row">
                <input className="input" value={sec.name} onChange={(e) => update((d) => void (d.settings.sections[i].name = e.target.value))} />
                <button className="icon-btn" onClick={() => update((d) => void d.settings.sections.splice(i, 1))} aria-label={t.delete}>✕</button>
              </div>
            ))}
            <button className="btn small" onClick={() => update((d) => void d.settings.sections.push({ id: `SEC${Date.now().toString(36).toUpperCase()}`, name: 'NEW' }))}>+ {t.add}</button>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>{t.shiftsSection}</h2>
        <p className="muted">{t.shiftCodeHelp}</p>
        <div className="three">
          <label className="field">{t.morningDefault}<input className="input" value={st.shifts.morningDefault} onChange={(e) => update((d) => void (d.settings.shifts.morningDefault = e.target.value.toUpperCase()))} /></label>
          <label className="field">{t.eveningDefault}<input className="input" value={st.shifts.eveningDefault} onChange={(e) => update((d) => void (d.settings.shifts.eveningDefault = e.target.value.toUpperCase()))} /></label>
          <label className="field">{t.eveningPartTime}<input className="input" value={st.shifts.eveningPartTime} onChange={(e) => update((d) => void (d.settings.shifts.eveningPartTime = e.target.value.toUpperCase()))} /></label>
        </div>
        <div className="grid-table">
          <div />
          {t.weekdaysShort.map((w) => <div key={w} className="gt-h">{w}</div>)}
          <div className="gt-l">{t.morningByDay}</div>
          {t.weekdaysShort.map((w, i) => (
            <input key={w} className="input gt-in" placeholder={st.shifts.morningDefault} value={st.shifts.morningByWeekday[i as Weekday] ?? ''} onChange={(e) => setByDay('morningByWeekday', i as Weekday, e.target.value)} />
          ))}
          <div className="gt-l">{t.eveningByDay}</div>
          {t.weekdaysShort.map((w, i) => (
            <input key={w} className="input gt-in" placeholder={st.shifts.eveningDefault} value={st.shifts.eveningByWeekday[i as Weekday] ?? ''} onChange={(e) => setByDay('eveningByWeekday', i as Weekday, e.target.value)} />
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t.rulesSection}</h2>
        <label className="check"><input type="checkbox" checked={r.managerEachShift} onChange={(e) => setRule('managerEachShift', e.target.checked)} />{t.managerEachShift}</label>
        <label className="check"><input type="checkbox" checked={r.noCloseThenOpen} onChange={(e) => setRule('noCloseThenOpen', e.target.checked)} />{t.noCloseThenOpen}</label>
        <div className="two">
          <label className="field">{t.maxConsecutive}<input className="input" type="number" value={r.maxConsecutiveDays} onChange={(e) => setRule('maxConsecutiveDays', Math.max(1, Number(e.target.value) || 1))} /></label>
          <label className="field">{t.maxRequests}<input className="input" type="number" value={r.maxRequestsPerPerson} onChange={(e) => setRule('maxRequestsPerPerson', Math.max(0, Number(e.target.value) || 0))} /></label>
        </div>
        <div className="grid-table">
          <div />
          {t.weekdaysShort.map((w) => <div key={w} className="gt-h">{w}</div>)}
          {(['minOpen', 'minClose', 'targetOpen', 'targetClose'] as const).map((k) => (
            <Row key={k} label={`${k.endsWith('Open') ? '☀' : '☾'} ${t[k]}`} values={r[k]} onChange={(i, v) => setPerDay(k, i, v)} />
          ))}
        </div>
        <div className="two">
          <label className="field">{t.holidayTargets} — {t.open}<input className="input" type="number" value={r.holidayTargetOpen} onChange={(e) => setRule('holidayTargetOpen', Number(e.target.value) || 0)} /></label>
          <label className="field">{t.close}<input className="input" type="number" value={r.holidayTargetClose} onChange={(e) => setRule('holidayTargetClose', Number(e.target.value) || 0)} /></label>
        </div>
      </section>

      <section className="card">
        <h2>{t.branchesSection}</h2>
        <div className="list-edit">
          {st.branches.map((b, i) => (
            <div key={i} className="le-row">
              <input className="input code-in" value={b.code} placeholder={t.code} onChange={(e) => update((d) => void (d.settings.branches[i].code = e.target.value.toUpperCase()))} />
              <input className="input" value={b.name} placeholder={t.branchName} onChange={(e) => update((d) => void (d.settings.branches[i].name = e.target.value))} />
              <button className="icon-btn" onClick={() => update((d) => void d.settings.branches.splice(i, 1))} aria-label={t.delete}>✕</button>
            </div>
          ))}
          <button className="btn small" onClick={() => update((d) => void d.settings.branches.push({ code: '', name: '' }))}>+ {t.add}</button>
        </div>
        <h2>{t.leaveSection}</h2>
        <div className="list-edit">
          {st.leaveTypes.map((l, i) => (
            <div key={i} className="le-row">
              <input className="input code-in" value={l.code} placeholder={t.code} onChange={(e) => update((d) => void (d.settings.leaveTypes[i].code = e.target.value.toUpperCase()))} />
              <input className="input code-in" type="number" value={l.hours} onChange={(e) => update((d) => void (d.settings.leaveTypes[i].hours = Number(e.target.value) || 0))} />
              <span className="muted">{t.hours}</span>
              <button className="icon-btn" onClick={() => update((d) => void d.settings.leaveTypes.splice(i, 1))} aria-label={t.delete}>✕</button>
            </div>
          ))}
          <button className="btn small" onClick={() => update((d) => void d.settings.leaveTypes.push({ code: '', hours: 8 }))}>+ {t.add}</button>
        </div>
      </section>

      <section className="card">
        <h2>{t.dataSection}</h2>
        <div className="btn-col">
          <button className="btn" onClick={backup}>⇩ {t.backup}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⇧ {t.restore}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          <button className="btn danger" onClick={async () => (await confirmDialog(t.confirmReset, { danger: true })) && replaceData(defaultAppData())}>{t.resetAll}</button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, values, onChange }: { label: string; values: number[]; onChange: (i: number, v: number) => void }) {
  return (
    <>
      <div className="gt-l">{label}</div>
      {values.map((v, i) => (
        <input key={i} className="input gt-in" type="number" inputMode="numeric" value={v} onChange={(e) => onChange(i, Number(e.target.value))} />
      ))}
    </>
  );
}
