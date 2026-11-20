import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from './config.ts';

type Kind = 'before' | 'after' | 'rework';

const SCENES: Record<string, Record<Kind, string>> = {
  Plumbing: {
    before: `<rect x="250" y="250" width="300" height="40" rx="8" fill="#94a3b8"/><rect x="380" y="140" width="40" height="120" rx="6" fill="#64748b"/><path d="M400 140 q0 -50 80 -50 h40" stroke="#64748b" stroke-width="22" fill="none" stroke-linecap="round"/><circle cx="525" cy="140" r="8" fill="#38bdf8"/><circle cx="530" cy="185" r="10" fill="#38bdf8"/><circle cx="522" cy="235" r="7" fill="#38bdf8"/><circle cx="320" cy="225" r="26" fill="#b45309" opacity=".75"/><text x="320" y="232" font-size="15" text-anchor="middle" fill="#fff" font-weight="700">RUST</text>`,
    after: `<rect x="250" y="250" width="300" height="40" rx="8" fill="#cbd5e1"/><rect x="380" y="140" width="40" height="120" rx="6" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/><path d="M400 140 q0 -50 80 -50 h40" stroke="#e2e8f0" stroke-width="22" fill="none" stroke-linecap="round"/><circle cx="320" cy="225" r="24" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/>`,
    rework: `<rect x="250" y="250" width="300" height="40" rx="8" fill="#cbd5e1"/><rect x="380" y="140" width="40" height="120" rx="6" fill="#e2e8f0" stroke="#94a3b8" stroke-width="3"/><path d="M400 140 q0 -50 80 -50 h40" stroke="#e2e8f0" stroke-width="22" fill="none" stroke-linecap="round"/><rect x="290" y="300" width="60" height="16" rx="8" fill="#14b8a6"/>`,
  },
  Electrical: {
    before: `<rect x="300" y="110" width="200" height="200" rx="18" fill="#f1f5f9" stroke="#94a3b8" stroke-width="5"/><path d="M300 110 l200 200" stroke="#475569" stroke-width="4"/><rect x="360" y="170" width="24" height="44" rx="4" fill="#334155"/><rect x="416" y="170" width="24" height="44" rx="4" fill="#334155"/><rect x="388" y="240" width="24" height="34" rx="4" fill="#334155"/><path d="M470 100 l-20 40 h24 l-22 44" stroke="#f59e0b" stroke-width="7" fill="none" stroke-linejoin="round"/><circle cx="380" cy="300" r="14" fill="#78350f" opacity=".5"/>`,
    after: `<rect x="300" y="110" width="200" height="200" rx="18" fill="#ffffff" stroke="#94a3b8" stroke-width="5"/><rect x="360" y="170" width="24" height="44" rx="4" fill="#334155"/><rect x="416" y="170" width="24" height="44" rx="4" fill="#334155"/><rect x="388" y="240" width="24" height="34" rx="4" fill="#334155"/><circle cx="480" cy="130" r="9" fill="#22c55e"/>`,
    rework: `<rect x="300" y="110" width="200" height="200" rx="18" fill="#ffffff" stroke="#14b8a6" stroke-width="5"/><rect x="360" y="170" width="24" height="44" rx="4" fill="#334155"/><rect x="416" y="170" width="24" height="44" rx="4" fill="#334155"/><rect x="388" y="240" width="24" height="34" rx="4" fill="#334155"/><circle cx="480" cy="130" r="9" fill="#22c55e"/>`,
  },
  Handyman: {
    before: `<rect x="220" y="90" width="360" height="220" rx="12" fill="#e2e8f0" stroke="#94a3b8" stroke-width="4" stroke-dasharray="14 10"/><rect x="250" y="250" width="300" height="70" rx="8" fill="#a16207" opacity=".7"/><rect x="290" y="150" width="140" height="80" rx="6" fill="#1e293b" transform="rotate(-8 360 190)"/><circle cx="520" cy="150" r="10" fill="#475569"/><circle cx="540" cy="200" r="7" fill="#475569"/>`,
    after: `<rect x="250" y="90" width="300" height="170" rx="10" fill="#0f172a"/><rect x="262" y="102" width="276" height="146" rx="6" fill="#134e4a"/><rect x="380" y="260" width="40" height="14" fill="#475569"/><rect x="250" y="285" width="300" height="40" rx="8" fill="#a16207"/>`,
    rework: `<rect x="250" y="90" width="300" height="170" rx="10" fill="#0f172a"/><rect x="262" y="102" width="276" height="146" rx="6" fill="#115e59"/><rect x="380" y="260" width="40" height="14" fill="#14b8a6"/><rect x="250" y="285" width="300" height="40" rx="8" fill="#a16207"/>`,
  },
};

function fmtStamp(ts: number) {
  return new Date(ts).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Writes a geo/timestamp-stamped sample job photo (SVG) into uploads and returns its public URL. */
export function createSamplePhoto(opts: { trade: string; kind: Kind; ref: string; lat: number; lng: number; takenAt: number }): string {
  const scene = (SCENES[opts.trade] || SCENES.Handyman)[opts.kind];
  const label = { before: 'BEFORE', after: 'AFTER', rework: 'REWORK' }[opts.kind];
  const tint = { before: '#fef3c7', after: '#ccfbf1', rework: '#e0f2fe' }[opts.kind];
  const badge = { before: '#b45309', after: '#0f766e', rework: '#0369a1' }[opts.kind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint}"/><stop offset="1" stop-color="#f8fafc"/></linearGradient></defs>
<rect width="800" height="450" fill="url(#g)"/>
<rect y="330" width="800" height="120" fill="#e2e8f0"/>
${scene}
<rect x="20" y="20" rx="10" width="128" height="40" fill="${badge}"/>
<text x="84" y="47" font-family="Helvetica,Arial,sans-serif" font-size="20" font-weight="800" text-anchor="middle" fill="#fff">${label}</text>
<rect x="0" y="392" width="800" height="58" fill="#0f172a" opacity=".82"/>
<text x="20" y="418" font-family="Menlo,monospace" font-size="16" fill="#fff">${opts.ref} · ${opts.trade} · SAMPLE PHOTO</text>
<text x="20" y="440" font-family="Menlo,monospace" font-size="15" fill="#99f6e4">GPS ${opts.lat.toFixed(5)}, ${opts.lng.toFixed(5)}  ·  ${fmtStamp(opts.takenAt)} SGT</text>
</svg>`;
  const name = `sample-${opts.ref}-${opts.kind}-${crypto.randomBytes(4).toString('hex')}.svg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), svg);
  return `/uploads/${name}`;
}
