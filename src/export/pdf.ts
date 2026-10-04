import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { validate, type AppData, type MonthPlan } from '../engine';
import type { Lang } from '../i18n/dicts';
import { EasyView } from '../ui/EasyView';
import { OriginalSheet } from '../ui/OriginalSheet';
import { download } from './download';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Renders the chosen layout off-screen, takes a picture of it and puts it on
 * one A3 landscape page. Using a picture keeps Thai and Japanese text exactly
 * as it looks in the app without embedding fonts.
 */
export async function exportPdf(data: AppData, plan: MonthPlan, layout: 'original' | 'easy', _lang: Lang): Promise<void> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;background:#fff;color:#000;';
  host.className = layout === 'easy' ? 'pdf-easy' : '';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    const issues = validate(data, plan);
    root.render(
      layout === 'original'
        ? createElement(OriginalSheet, { data, plan })
        : createElement('div', { style: { padding: 16, background: '#fff' } }, createElement(EasyView, { data, plan, issues, mode: 'table' })),
    );
    await new Promise((r) => setTimeout(r, 150));
    await document.fonts?.ready;
    const target = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', logging: false });

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const ratio = Math.min((pageW - margin * 2) / canvas.width, (pageH - margin * 2) / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (pageW - w) / 2, margin, w, h);
    const name = `Shift_${data.settings.storeName.replace(/\s+/g, '')}_${MONTHS_EN[plan.month - 1].toUpperCase()}_${plan.year}${layout === 'easy' ? '_easy' : ''}.pdf`;
    await download(pdf.output('blob'), name);
  } finally {
    root.unmount();
    host.remove();
  }
}
