/**
 * The few layout rules the Overview / Skills panels need that inline styles
 * can't express: container-query stacking (a panel's own width decides, not
 * the viewport — the sidebar takes a different share at every size).
 */
import { COLOR } from '../../lib/tokens';

const CSS = `
  .pbt-ov-cq { container-type: inline-size; }
  .pbt-ov-hero { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(250px, 1fr); }
  .pbt-ov-hero > :last-child { border-left: 0.5px solid rgba(60,20,15,0.07); }
  @container (max-width: 760px) {
    .pbt-ov-hero { grid-template-columns: 1fr; }
    .pbt-ov-hero > :last-child { border-left: none; border-top: 0.5px solid rgba(60,20,15,0.07); }
  }
  .pbt-ov-two { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
  @container (max-width: 520px) { .pbt-ov-two { grid-template-columns: 1fr; } }
  .pbt-ov-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; align-items: center; }
  .pbt-ov-strip > * + * { border-left: 0.5px solid rgba(60,20,15,0.07); }
  @container (max-width: 820px) {
    .pbt-ov-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pbt-ov-strip > * + * { border-left: none; }
    .pbt-ov-strip > :last-child { grid-column: 1 / -1; justify-self: start; }
  }
  .pbt-ov-inbox-row { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 12px; align-items: start; width: 100%; padding: 12px 12px; border-radius: 14px; cursor: pointer; }
  .pbt-ov-inbox-row:hover { background: rgba(60,20,15,0.035); }
  .pbt-ov-inbox-row:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 1px; }
  .pbt-ov-inbox-row:hover .pbt-ov-go { text-decoration: underline; }
  @container (max-width: 460px) {
    .pbt-ov-inbox-row { grid-template-columns: 30px minmax(0, 1fr); }
    .pbt-ov-inbox-row .pbt-ov-go { grid-column: 2; }
  }
  .pbt-sk-table th, .pbt-sk-table td { white-space: nowrap; }
  .pbt-sk-short { display: none; }
  .pbt-sk-labelcol { width: 25%; }
  .pbt-sk-head { overflow: hidden; text-overflow: ellipsis; }
  @container (max-width: 700px) {
    .pbt-sk-full { display: none; }
    .pbt-sk-short { display: inline; }
    .pbt-sk-labelcol { width: 23%; }
  }
  abbr.pbt-sk-short { text-decoration: none; }
`;

export function ensureOverviewStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('pbt-overview-css')) return;
  const s = document.createElement('style');
  s.id = 'pbt-overview-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

ensureOverviewStyles();
