import { useEffect, useState } from 'react';
import { nextMonth, prevMonth } from '../engine';
import { LANGS, useT } from '../i18n';
import iconUrl from '../assets/icon.svg';
import { isFirstRun, useStore } from '../store';
import { DialogHost } from './Dialog';
import { MonthScreen } from './MonthScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsScreen } from './SettingsScreen';
import { StaffScreen } from './StaffScreen';

type Tab = 'schedule' | 'month' | 'staff' | 'settings';

export function App() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('schedule');
  const year = useStore((s) => s.year);
  const month = useStore((s) => s.month);
  const goMonth = useStore((s) => s.goMonth);
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const generate = useStore((s) => s.generate);
  const storeName = useStore((s) => s.data.settings.storeName);

  useEffect(() => {
    // Show a ready-made schedule the first time the app is opened.
    if (isFirstRun) void generate(1);
  }, [generate]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const go = (dir: -1 | 1) => {
    const m = dir < 0 ? prevMonth(year, month) : nextMonth(year, month);
    goMonth(m.year, m.month);
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'schedule', label: t.tabSchedule, icon: '▦' },
    { id: 'month', label: t.tabMonth, icon: '✎' },
    { id: 'staff', label: t.tabStaff, icon: '☺' },
    { id: 'settings', label: t.tabSettings, icon: '⚙' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={iconUrl} alt="" width={28} height={28} />
          <div>
            <div className="brand-name">{t.appName}</div>
            <div className="brand-store">{storeName}</div>
          </div>
        </div>
        <div className="month-nav">
          <button className="icon-btn" onClick={() => go(-1)} aria-label="previous month">‹</button>
          <span className="month-label">{t.months[month - 1]} {year}</span>
          <button className="icon-btn" onClick={() => go(1)} aria-label="next month">›</button>
        </div>
        <select className="lang" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} aria-label={t.language}>
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </header>
      <nav className="tabs">
        {tabs.map((x) => (
          <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
            <span className="ti">{x.icon}</span>
            <span className="tl">{x.label}</span>
          </button>
        ))}
      </nav>
      <main>
        {tab === 'schedule' ? <ScheduleScreen /> : null}
        {tab === 'month' ? <MonthScreen /> : null}
        {tab === 'staff' ? <StaffScreen /> : null}
        {tab === 'settings' ? <SettingsScreen /> : null}
      </main>
      <DialogHost />
    </div>
  );
}
