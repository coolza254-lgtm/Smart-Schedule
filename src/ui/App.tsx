import { useEffect, useState } from 'react';
import iconUrl from '../assets/icon.svg';
import { nextMonth, prevMonth } from '../engine';
import { LANGS, useT } from '../i18n';
import { isFirstRun, useStore } from '../store';
import { AuditScreen } from './AuditScreen';
import { DialogHost } from './Dialog';
import { Icon, type IconName } from './Icon';
import { MonthScreen } from './MonthScreen';
import { RequestScreen } from './RequestScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { SettingsScreen } from './SettingsScreen';
import { StaffScreen } from './StaffScreen';

export type Tab = 'schedule' | 'requests' | 'audit' | 'month' | 'staff' | 'settings';

const TAB_ICONS: Record<Tab, IconName> = {
  schedule: 'schedule',
  requests: 'requests',
  audit: 'audit',
  month: 'month',
  staff: 'staff',
  settings: 'settings',
};

const TABS = Object.keys(TAB_ICONS) as Tab[];

function initialTab(): Tab {
  const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
  return (TABS as string[]).includes(h) ? (h as Tab) : 'schedule';
}

export function App() {
  const t = useT();
  const [tab, setTab] = useState<Tab>(initialTab);
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

  const open = (x: Tab) => {
    setTab(x);
    try {
      history.replaceState(null, '', `#${x}`);
    } catch {
      // Some hosts don't allow changing the URL; the tab still switches.
    }
    window.scrollTo({ top: 0 });
  };

  const go = (dir: -1 | 1) => {
    const m = dir < 0 ? prevMonth(year, month) : nextMonth(year, month);
    goMonth(m.year, m.month);
  };

  const label: Record<Tab, string> = {
    schedule: t.tabSchedule,
    requests: t.tabRequests,
    audit: t.tabAudit,
    month: t.tabMonth,
    staff: t.tabStaff,
    settings: t.tabSettings,
  };
  const title: Record<Tab, [string, string]> = {
    schedule: [t.pageSchedule, t.pageScheduleSub],
    requests: [t.pageRequests, t.pageRequestsSub],
    audit: [t.pageAudit, t.pageAuditSub],
    month: [t.pageMonth, t.pageMonthSub],
    staff: [t.pageStaff, t.pageStaffSub],
    settings: [t.pageSettings, t.pageSettingsSub],
  };

  const langSelect = (
    <select className="lang" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} aria-label={t.language}>
      {LANGS.map((l) => (
        <option key={l.id} value={l.id}>
          {l.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand">
          <img src={iconUrl} alt="" />
          <div>
            <div className="side-name">{t.appName}</div>
            <div className="side-store">{storeName}</div>
          </div>
        </div>
        <nav className="side-nav" aria-label="Sections">
          {TABS.map((x, i) => (
            <div key={x}>
              {i === 3 ? <div className="side-label">{t.sideSetup}</div> : null}
              <button className={tab === x ? 'on' : ''} onClick={() => open(x)} aria-current={tab === x ? 'page' : undefined}>
                <Icon name={TAB_ICONS[x]} />
                {label[x]}
              </button>
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <span>{t.language}</span>
          {langSelect}
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <img className="brand-mark" src={iconUrl} alt="" />
          <div className="page-head">
            <h1 className="page-title">{title[tab][0]}</h1>
            <p className="page-sub">{title[tab][1]}</p>
          </div>
          <div className="month-nav">
            <button className="icon-btn" onClick={() => go(-1)} aria-label="previous month">
              <Icon name="chevronLeft" size={18} />
            </button>
            <span className="month-label">
              {t.months[month - 1]} {year}
            </span>
            <button className="icon-btn" onClick={() => go(1)} aria-label="next month">
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
          {langSelect}
        </header>
        <main>
          {tab === 'schedule' ? <ScheduleScreen /> : null}
          {tab === 'requests' ? <RequestScreen /> : null}
          {tab === 'audit' ? <AuditScreen /> : null}
          {tab === 'month' ? <MonthScreen /> : null}
          {tab === 'staff' ? <StaffScreen /> : null}
          {tab === 'settings' ? <SettingsScreen /> : null}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Sections">
        {TABS.map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} onClick={() => open(x)} aria-current={tab === x ? 'page' : undefined}>
            <Icon name={TAB_ICONS[x]} size={21} />
            <span>{label[x]}</span>
          </button>
        ))}
      </nav>
      <DialogHost />
    </div>
  );
}
