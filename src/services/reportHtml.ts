import type { ReportStats, TrendGeometry } from './reportStats';

/* ────────────────────────────────────────────────────────────
 * THE DOCTOR'S PDF.
 *
 * Deliberately free of app imports — it takes plain data and returns a
 * string. That keeps it printable from anywhere and, more usefully, means
 * the document can be rendered and inspected on its own instead of only
 * through a print dialog.
 *
 * Written in French: it is handed to Moroccan practitioners, and a report a
 * doctor cannot read is a report nobody reads.
 * ──────────────────────────────────────────────────────────── */

export interface ReportPatient {
  name?: string | null;
  diabetesType?: string | null;
  carbRatio?: number | null;
  correctionFactor?: number | null;
  bolusInsulinName?: string | null;
  basalInsulinName?: string | null;
  basalDose?: number | null;
  doctorName?: string | null;
}

export interface ReportMealRow {
  createdAt: string;
  name: string;
  carbs: number;
  sugar: number;
  calories: number;
  sourceLabel: string;
}

export interface ReportNarrative {
  observations: string[];
  positives: string[];
  improvements: string[];
}

const TYPE_FR: Record<string, string> = {
  type1: 'Type 1',
  type2: 'Type 2',
  gestational: 'Gestationnel',
  prediabetes: 'Prédiabète',
};

export const SLOT_FR: Record<string, string> = {
  night: 'Nuit (0–6 h)',
  morning: 'Matin (6–12 h)',
  afternoon: 'Après-midi (12–18 h)',
  evening: 'Soir (18–24 h)',
};

export const BAND_COLORS = {
  veryLow: '#C2185B',
  low: '#FF7A1A',
  inRange: '#19C37D',
  high: '#F2B84B',
  veryHigh: '#E5484D',
};

const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string
  );

const fr = (n: number) => n.toLocaleString('fr-FR');

const fmtD = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

export function buildReportHtml(args: {
  stats: ReportStats;
  narrative: ReportNarrative;
  patient: ReportPatient;
  low: number;
  high: number;
  trend: TrendGeometry | null;
  meals: ReportMealRow[];
}): string {
  const { stats, narrative, patient, low, high, trend, meals } = args;

  const band = (label: string, pct: number, color: string) => `
    <div class="bandrow">
      <span class="dot" style="background:${color}"></span>
      <span class="bl">${label}</span>
      <span class="bv">${fr(pct)} %</span>
    </div>`;

  const trendSvg = trend
    ? `<svg viewBox="0 0 ${trend.width} ${trend.height}" width="100%" height="190"
            xmlns="http://www.w3.org/2000/svg">
         <rect x="34" y="${trend.band.y}" width="${trend.width - 42}" height="${trend.band.height}"
               fill="#19C37D" opacity="0.12"/>
         ${trend.yTicks
           .map(
             (t) => `<line x1="34" y1="${t.y}" x2="${trend.width - 8}" y2="${t.y}"
                            stroke="#E4EBE7" stroke-width="1"/>
                     <text x="2" y="${t.y + 4}" font-size="11" fill="#9AA8A0">${t.value}</text>`
           )
           .join('')}
         <path d="${trend.area}" fill="#2FC178" opacity="0.14"/>
         <path d="${trend.line}" stroke="#149A57" stroke-width="2.5" fill="none"
               stroke-linejoin="round" stroke-linecap="round"/>
         ${trend.points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#149A57"/>`).join('')}
         <text x="34" y="${trend.height - 6}" font-size="11" fill="#9AA8A0">${esc(trend.points[0].label)}</text>
         <text x="${trend.width - 8}" y="${trend.height - 6}" font-size="11" fill="#9AA8A0"
               text-anchor="end">${esc(trend.points[trend.points.length - 1].label)}</text>
       </svg>`
    : '<div class="empty">Pas assez de mesures pour tracer une courbe sur cette période.</div>';

  let x = 0;
  const tirSvg = stats.count
    ? `<svg viewBox="0 0 600 26" width="100%" height="26" xmlns="http://www.w3.org/2000/svg">${(
        [
          [stats.veryLowPct, BAND_COLORS.veryLow],
          [stats.lowPct, BAND_COLORS.low],
          [stats.inRangePct, BAND_COLORS.inRange],
          [stats.highPct, BAND_COLORS.high],
          [stats.veryHighPct, BAND_COLORS.veryHigh],
        ] as [number, string][]
      )
        .map(([pct, color]) => {
          const w = (pct / 100) * 600;
          const seg = w > 0 ? `<rect x="${x}" y="0" width="${w}" height="26" fill="${color}"/>` : '';
          x += w;
          return seg;
        })
        .join('')}</svg>`
    : '';

  const glucoseRows = stats.glucose
    .slice(-80)
    .reverse()
    .map((g) => {
      const d = new Date(g.created_at);
      const status =
        g.value < 54
          ? 'Très basse'
          : g.value < low
            ? 'Basse'
            : g.value > 250
              ? 'Très élevée'
              : g.value > high
                ? 'Élevée'
                : 'Dans la cible';
      const color = g.value < low ? '#E5484D' : g.value > high ? '#D9822B' : '#2E9E5B';
      return `<tr>
        <td>${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
        <td class="num" style="color:${color}"><b>${g.value}</b></td>
        <td>${status}</td>
        <td>${esc(g.notes ?? '')}</td>
      </tr>`;
    })
    .join('');

  const dayRows = stats.byDay
    .filter((d) => d.count || d.carbs || d.insulin)
    .reverse()
    .map(
      (d) => `<tr>
        <td>${esc(d.label)}</td>
        <td class="num">${d.avg ?? '—'}</td>
        <td class="num">${d.min ?? '—'}${d.max !== null ? ` / ${d.max}` : ''}</td>
        <td class="num">${d.count}</td>
        <td class="num">${Math.round(d.carbs) || '—'}</td>
        <td class="num">${d.insulin ? fr(Math.round(d.insulin * 10) / 10) : '—'}</td>
      </tr>`
    )
    .join('');

  const mealRows = meals
    .slice(0, 40)
    .map(
      (m) => `<tr>
        <td>${new Date(m.createdAt).toLocaleDateString('fr-FR')}</td>
        <td>${esc(m.name)}</td>
        <td class="num">${Math.round(m.carbs)} g</td>
        <td class="num">${Math.round(m.sugar)} g</td>
        <td class="num">${Math.round(m.calories)}</td>
        <td>${esc(m.sourceLabel)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif;
         color: #14231C; font-size: 12px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #149A57; padding-bottom: 10px; }
  h1 { font-size: 19px; margin: 0; letter-spacing: -0.3px; }
  .period { font-size: 12px; color: #4A5A52; margin-top: 3px; }
  .brand { font-size: 11px; color: #149A57; font-weight: 700; text-align: right; white-space: nowrap; }
  h2 { font-size: 13.5px; margin: 20px 0 7px; padding-bottom: 4px;
       border-bottom: 1px solid #E4EBE7; }
  .patient { background: #F6F9F5; border: 1px solid #E4EBE7; border-radius: 8px;
             padding: 10px 12px; margin-top: 12px; line-height: 1.7; font-size: 11.5px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .kpi { flex: 1 1 118px; border: 1px solid #E4EBE7; border-radius: 8px; padding: 9px 10px; }
  .kpi .l { font-size: 9px; color: #63736A; text-transform: uppercase; letter-spacing: .4px; }
  .kpi .v { font-size: 17px; font-weight: 800; margin-top: 3px; }
  .hero { display: flex; gap: 10px; margin-top: 12px; }
  .heroBox { flex: 1; background: #22374B; color: #fff; border-radius: 10px; padding: 12px 14px; }
  .heroBox .l { font-size: 10px; opacity: .88; text-transform: uppercase; letter-spacing: .5px; }
  .heroBox .v { font-size: 27px; font-weight: 800; margin-top: 2px; }
  .bandrow { display: flex; align-items: center; gap: 7px; padding: 3px 0; font-size: 11.5px; }
  .dot { width: 9px; height: 9px; border-radius: 5px; display: inline-block; }
  .bl { flex: 1; }
  .bv { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  th { text-align: left; color: #63736A; font-weight: 600; padding: 6px 5px;
       border-bottom: 1.5px solid #E4EBE7; font-size: 10px; text-transform: uppercase;
       letter-spacing: .3px; }
  td { padding: 5px; border-bottom: 1px solid #F0F4F1; }
  td.num, th.num { text-align: right; }
  tr { page-break-inside: avoid; }
  .page { page-break-before: always; }
  .note { background: #FFF6E5; border: 1px solid #F6DFB0; border-radius: 8px;
          padding: 9px 11px; font-size: 11px; color: #8A5B00; margin-top: 10px; }
  .empty { color: #9AA8A0; font-size: 11.5px; padding: 10px 0; }
  .disc { margin-top: 18px; padding-top: 10px; border-top: 1px solid #E4EBE7;
          font-size: 9.5px; color: #7B8A82; line-height: 1.6; }
</style></head><body>

  <div class="head">
    <div>
      <h1>Rapport glycémique</h1>
      <div class="period"><b>Période :</b> du ${fmtD(stats.from)} au ${fmtD(stats.to)}
        &nbsp;·&nbsp; ${stats.days} jours &nbsp;·&nbsp; ${stats.count} mesure${stats.count > 1 ? 's' : ''}
        (${fr(stats.perDay)}/jour)</div>
    </div>
    <div class="brand">GluciAI<br><span style="color:#7B8A82;font-weight:500">
      Édité le ${new Date().toLocaleDateString('fr-FR')}</span></div>
  </div>

  <div class="patient">
    <b>Patient :</b> ${esc(patient.name || '—')}
    &nbsp;·&nbsp; <b>Diabète :</b> ${TYPE_FR[patient.diabetesType ?? 'type2'] ?? '—'}
    &nbsp;·&nbsp; <b>Cible :</b> ${low}–${high} mg/dL
    ${patient.carbRatio ? `&nbsp;·&nbsp; <b>Ratio :</b> 1 U / ${patient.carbRatio} g` : ''}
    ${patient.correctionFactor ? `&nbsp;·&nbsp; <b>Correction :</b> ${patient.correctionFactor} mg/dL/U` : ''}
    ${patient.bolusInsulinName ? `<br><b>Insuline rapide :</b> ${esc(patient.bolusInsulinName)}` : ''}
    ${patient.basalInsulinName ? `&nbsp;·&nbsp; <b>Basale :</b> ${esc(patient.basalInsulinName)}${patient.basalDose ? ` ${patient.basalDose} U/j` : ''}` : ''}
    ${patient.doctorName ? `<br><b>Médecin :</b> ${esc(patient.doctorName)}` : ''}
  </div>

  <div class="hero">
    <div class="heroBox">
      <div class="l">HbA1c estimée (ADAG)</div>
      <div class="v">${stats.ea1c !== null ? fr(stats.ea1c) : '—'} %</div>
    </div>
    <div class="heroBox" style="background:#2F4A63">
      <div class="l">GMI</div>
      <div class="v">${stats.gmi !== null ? fr(stats.gmi) : '—'} %</div>
    </div>
    <div class="heroBox" style="background:${stats.inRangePct >= 70 ? '#149A57' : '#B87A12'}">
      <div class="l">Temps dans la cible</div>
      <div class="v">${stats.count ? `${fr(stats.inRangePct)} %` : '—'}</div>
    </div>
  </div>

  ${
    stats.count && stats.perDay < 1
      ? `<div class="note">⚠️ ${fr(stats.perDay)} mesure par jour en moyenne : les pourcentages
         ci-dessous reposent sur un échantillon trop faible pour représenter la journée entière.</div>`
      : ''
  }

  <h2>Répartition des mesures</h2>
  ${tirSvg}
  <div style="margin-top:8px">
    ${band('Très élevé (&gt; 250 mg/dL)', stats.veryHighPct, BAND_COLORS.veryHigh)}
    ${band(`Élevé (&gt; ${high} mg/dL)`, stats.highPct, BAND_COLORS.high)}
    ${band(`Dans la cible (${low}–${high} mg/dL)`, stats.inRangePct, BAND_COLORS.inRange)}
    ${band(`Bas (&lt; ${low} mg/dL)`, stats.lowPct, BAND_COLORS.low)}
    ${band('Très bas (&lt; 54 mg/dL)', stats.veryLowPct, BAND_COLORS.veryLow)}
  </div>

  <h2>Moyenne glycémique par jour</h2>
  ${trendSvg}

  <h2>Indicateurs</h2>
  <div class="kpis">
    <div class="kpi"><div class="l">Moyenne</div><div class="v">${stats.avg ?? '—'}<small> mg/dL</small></div></div>
    <div class="kpi"><div class="l">Écart-type</div><div class="v">${stats.sd ?? '—'}<small> mg/dL</small></div></div>
    <div class="kpi"><div class="l">Variabilité (CV)</div><div class="v" style="color:${stats.cv !== null && stats.cv > 36 ? '#D9822B' : '#2E9E5B'}">${stats.cv !== null ? fr(stats.cv) : '—'}<small> %</small></div></div>
    <div class="kpi"><div class="l">Min / Max</div><div class="v">${stats.min ?? '—'} / ${stats.max ?? '—'}</div></div>
    <div class="kpi"><div class="l">Hypoglycémies</div><div class="v" style="color:#E5484D">${stats.lows}</div></div>
    <div class="kpi"><div class="l">Hyperglycémies</div><div class="v" style="color:#D9822B">${stats.highs}</div></div>
    <div class="kpi"><div class="l">Insuline / jour</div><div class="v">${stats.avgInsulinPerDay !== null ? fr(stats.avgInsulinPerDay) : '—'}<small> U</small></div></div>
    <div class="kpi"><div class="l">Rapide / Lente</div><div class="v" style="font-size:14px">${fr(stats.rapidU)} / ${fr(stats.longU)}<small> U</small></div></div>
    <div class="kpi"><div class="l">Glucides / jour</div><div class="v">${stats.avgCarbsPerDay ?? '—'}<small> g</small></div></div>
    <div class="kpi"><div class="l">Sucres / jour</div><div class="v">${stats.avgSugarPerDay ?? '—'}<small> g</small></div></div>
    <div class="kpi"><div class="l">Repas suivis</div><div class="v">${stats.mealsCount}</div></div>
    <div class="kpi"><div class="l">Activité</div><div class="v">${stats.totalActivityMin}<small> min</small></div></div>
  </div>

  <h2>Par moment de la journée</h2>
  <table>
    <tr><th>Moment</th><th class="num">Mesures</th><th class="num">Moyenne</th><th class="num">Basses</th><th class="num">Élevées</th></tr>
    ${stats.bySlot
      .map(
        (s) => `<tr>
          <td>${SLOT_FR[s.key]}</td>
          <td class="num">${s.count}</td>
          <td class="num"><b style="color:${s.avg === null ? '#9AA8A0' : s.avg < low ? '#E5484D' : s.avg > high ? '#D9822B' : '#2E9E5B'}">${s.avg ?? '—'}</b></td>
          <td class="num">${s.lows}</td>
          <td class="num">${s.highs}</td>
        </tr>`
      )
      .join('')}
  </table>

  <h2>Lecture de la période</h2>
  <div class="patient">
    ${narrative.observations.map((o) => `📋 ${esc(o)}`).join('<br>')}
    ${narrative.positives.length ? `<br><b>Points positifs :</b><br>${narrative.positives.map((p) => `✅ ${esc(p)}`).join('<br>')}` : ''}
    ${narrative.improvements.length ? `<br><b>Axes d'amélioration :</b><br>${narrative.improvements.map((p) => `💡 ${esc(p)}`).join('<br>')}` : ''}
  </div>

  <div class="page"></div>
  <h2>Journal par jour</h2>
  <table>
    <tr><th>Jour</th><th class="num">Moy.</th><th class="num">Min / Max</th><th class="num">Mesures</th><th class="num">Glucides</th><th class="num">Insuline</th></tr>
    ${dayRows || '<tr><td colspan="6" class="empty">Aucune donnée sur la période.</td></tr>'}
  </table>

  <h2>Mesures de glycémie (${Math.min(80, stats.count)} dernières)</h2>
  <table>
    <tr><th>Date</th><th class="num">mg/dL</th><th>Statut</th><th>Notes</th></tr>
    ${glucoseRows || '<tr><td colspan="4" class="empty">Aucune mesure sur la période.</td></tr>'}
  </table>

  ${
    mealRows
      ? `<h2>Repas enregistrés</h2>
         <table>
           <tr><th>Date</th><th>Aliment</th><th class="num">Glucides</th><th class="num">Sucres</th><th class="num">kcal</th><th>Source</th></tr>
           ${mealRows}
         </table>`
      : ''
  }

  <div class="disc">
    <b>Méthode et limites.</b> Toutes les valeurs proviennent des saisies du patient dans
    GluciAI, sur la période indiquée en tête de document. L'HbA1c estimée suit la formule ADAG
    ((moyenne + 46,7) / 28,7) et le GMI la formule de Bergenstal (3,31 + 0,02392 × moyenne) :
    ce sont des <b>estimations calculées à partir de glycémies capillaires auto-mesurées</b>,
    et non des dosages de laboratoire. Les pourcentages de temps dans les cibles reposent sur
    les seules mesures enregistrées et ne représentent la journée entière que si les relevés
    sont suffisamment nombreux et répartis dans le nycthémère. Les glucides des repas
    proviennent de bases nutritionnelles (USDA, Open Food Facts, base marocaine) ou d'une
    estimation par IA lorsque la source l'indique. Document destiné à être interprété par un
    professionnel de santé.
  </div>
</body></html>`;
}
