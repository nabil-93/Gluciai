/* ── GluciAI Dashboard ─────────────────────────────────────────────────────
   Static admin/doctor panel. Auth + data via Supabase (RLS enforced):
   - admin  : sees everything, manages doctors, patients, promos, subs, locks
   - doctor : sees only their linked patients, generates promo codes
   Patients cannot log in here.                                              */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ftqyzpkzqeudzfztataz.supabase.co';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0cXl6cGt6cWV1ZHpmenRhdGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjA1NDgsImV4cCI6MjA5ODkzNjU0OH0.5h0C4vlYiZ6TgBH5UqfsAscBmwOSnZcUKzTZZFhLZGM';

const db = createClient(SUPABASE_URL, ANON_KEY);
const app = document.getElementById('app');

let me = null; // { id, role: 'admin'|'doctor', name, email }

/* ── Icons (lucide-style, inline) ── */
const I = {
  logo: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C12 2 5.5 9.5 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2 12 2Z"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  steth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
  pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  syringe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
  group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3.2"/><path d="M6.5 21v-1.6a5.5 5.5 0 0 1 11 0V21"/><circle cx="4.5" cy="9.5" r="2.2"/><path d="M1 19.5v-.9a3.7 3.7 0 0 1 4.6-3.58"/><circle cx="19.5" cy="9.5" r="2.2"/><path d="M23 19.5v-.9a3.7 3.7 0 0 0-4.6-3.58"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
};

const FEATURES = [
  { key: 'scanner', label: 'Scanner de repas', desc: 'Analyse des repas par photo (IA)', icon: '📷', bg: '#e8f1fe' },
  { key: 'ai_chat', label: "Chat avec l'IA", desc: 'Assistant conversationnel Gemini', icon: '💬', bg: '#f3f0ff' },
  { key: 'ai_call', label: 'Appel vocal IA', desc: "Appel téléphonique avec l'IA", icon: '📞', bg: '#e9fbf2' },
];

/* Fonctions CACHÉES : l'inverse des locks ci-dessus. Elles n'existent pour
 * PERSONNE (aucune icône, aucune demande d'accès, aucune trace dans l'app)
 * tant que l'admin ne les active pas explicitement pour un compte
 * (feature_access allowed=true). Visibles uniquement par l'admin ici. */
const HIDDEN_FEATURES = [
  { key: 'labs', label: 'Analyses biologiques', desc: 'Photo du bilan → IA : valeurs, graphiques, rapport, docteur vocal', icon: '🧪', bg: '#fdf2ff' },
  { key: 'world_recipes', label: 'Plats du monde', desc: 'Recettes du monde générées par IA — invisible tant que non activée', icon: '🍽️', bg: '#fef3e8' },
];

/* Rubriques de CONTENU : visibles par défaut, mais l'admin peut les masquer
 * pour un patient (feature_access allowed=false). Aucune écran de blocage —
 * la rubrique disparaît simplement de l'app. */
const CONTENT_SECTIONS = [
  { key: 'healthy_selection', label: 'Sélection Santé', desc: 'Plats sains sélectionnés (Makla saine)', icon: '🥗', bg: '#e9fbf2' },
  { key: 'world_foods', label: 'Base Mondiale', desc: 'Recherche produits Open Food Facts (Makla saine)', icon: '🌍', bg: '#e8f1fe' },
];

/* Usage limits (quotas) — the four AI features that carry a day/week/month
 * budget (usage_limits / usage_default_limits, migration 0020). For ai_call
 * the unit is minutes; the others are counts. */
const USAGE_LIMIT_FEATURES = [
  { key: 'scanner', label: 'Scanner de repas', icon: '📷', bg: '#e8f1fe', unit: 'scans' },
  { key: 'ai_chat', label: "Chat avec l'IA", icon: '💬', bg: '#f3f0ff', unit: 'messages' },
  { key: 'ai_call', label: 'Appel vocal IA', icon: '📞', bg: '#e9fbf2', unit: 'min' },
  { key: 'labs', label: 'Analyse de rapport', icon: '🧪', bg: '#fdf2ff', unit: 'analyses' },
];
const PERIOD_LABEL = { day: 'Jour', week: 'Semaine', month: 'Mois' };

const PLAN_LABEL = { free: 'Gratuit', monthly: 'Mensuel', yearly: 'Annuel' };
const AVATAR_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

/* ── Small helpers ── */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtDT = (iso) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
const timeAgo = (iso) => {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
};
const initials = (name, email) => {
  const src = (name || '').trim() || (email || '?');
  return src.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
};
const avColor = (seed) => {
  let h = 0;
  for (const c of String(seed || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const avatar = (name, email, lg = false) =>
  `<div class="avatar${lg ? ' lg' : ''}" style="background:${avColor(email || name)}">${esc(initials(name, email))}</div>`;

function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function modal(html) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal">${html}</div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => ov.remove()));
  return ov;
}

async function adminOp(payload) {
  const { data: { session } } = await db.auth.getSession();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-ops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  return r.json();
}

/* ── Badges ── */
function subBadge(row) {
  const status = row?.status ?? null;
  const exp = row?.expires_at ? new Date(row.expires_at) : null;
  if (!status || status === 'none') return '<span class="badge gray">Aucun</span>';
  if (exp && exp < new Date()) return '<span class="badge red">Expiré</span>';
  if (status === 'active') return '<span class="badge green">Actif</span>';
  if (status === 'trial') return '<span class="badge blue">Essai</span>';
  if (status === 'expired') return '<span class="badge red">Expiré</span>';
  if (status === 'canceled') return '<span class="badge gray">Annulé</span>';
  if (status === 'unpaid') return '<span class="badge amber">Impayé</span>';
  return `<span class="badge gray">${esc(status)}</span>`;
}
function glyBadge(v) {
  const n = Number(v);
  if (n < 70) return `<span class="badge blue">${n} · Bas</span>`;
  if (n <= 180) return `<span class="badge green">${n} · Bon</span>`;
  if (n <= 250) return `<span class="badge amber">${n} · Modéré</span>`;
  return `<span class="badge red">${n} · Élevé</span>`;
}

/* Glucose risk flag from the 14-day window in patient_overview. Target range
 * is 70–180 mg/dL; "severe" means < 54 or > 250. A patient is flagged when a
 * meaningful share of recent readings fall out of range. */
function glyFlag(p) {
  const total = Number(p.gly_14d || 0);
  const out = Number(p.gly_out_14d || 0);
  const severe = Number(p.gly_severe_14d || 0);
  if (!total) return { level: 'none', label: '—', cls: 'gray' };
  const ratio = out / total;
  if (severe >= 2 || (ratio >= 0.5 && total >= 4)) return { level: 'critique', label: '🔴 Critique', cls: 'red' };
  if (out >= 3 || ratio >= 0.25) return { level: 'surveiller', label: '🟠 À surveiller', cls: 'amber' };
  return { level: 'ok', label: '🟢 OK', cls: 'green' };
}

/* Time-bucket test shared by the "dernière connexion" and "dernière activité"
 * filters. Buckets: today (<1j), 7d (<7j), 30d (<30j), old (≥30j), never. */
function inTimeBucket(iso, bucket) {
  if (!bucket) return true;
  if (bucket === 'never') return !iso;
  if (!iso) return false;
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (bucket === 'today') return days < 1;
  if (bucket === '7d') return days < 7;
  if (bucket === '30d') return days < 30;
  if (bucket === 'old') return days >= 30;
  return true;
}
const daysLeft = (iso) => {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
};

/* ── Months / payments helpers ── */
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const fmtMonth = (key) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
/** List of 'YYYY-MM' from the subscription start to today (capped at expiry). */
function monthsDue(sub) {
  if (!sub?.starts_at || !sub.status || sub.status === 'none') return [];
  const start = new Date(sub.starts_at);
  let end = new Date();
  if (sub.expires_at && new Date(sub.expires_at) < end) end = new Date(sub.expires_at);
  const out = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (d <= last && out.length < 120) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}
const fmtDur = (sec) => {
  const m = Math.floor((sec || 0) / 60), s = (sec || 0) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
/** Effective subscription status (expiry beats the stored status). */
const statusOf = (row) => {
  if (!row?.status || row.status === 'none') return 'none';
  if (row.expires_at && new Date(row.expires_at) < new Date()) return 'expired';
  return row.status;
};

/* WhatsApp deep link — normalizes local numbers (MA/DE) to international. */
function waHref(phone, lang, msg) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = (lang === 'de' ? '49' : '212') + d.slice(1);
  return `https://wa.me/${d}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;
}

function lightbox(url, caption) {
  const ov = document.createElement('div');
  ov.className = 'lightbox';
  ov.innerHTML = `<img src="${esc(url)}" alt="" />${caption ? `<div class="lb-cap">${esc(caption)}</div>` : ''}`;
  ov.addEventListener('click', () => ov.remove());
  document.body.appendChild(ov);
}

/* ── Auth / boot ── */
async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return renderLogin();
  const { data: prof } = await db.from('profiles').select('role,name,email').eq('user_id', session.user.id).maybeSingle();
  if (!prof || (prof.role !== 'admin' && prof.role !== 'doctor')) {
    await db.auth.signOut();
    return renderLogin('Accès réservé aux médecins et administrateurs.');
  }
  me = { id: session.user.id, role: prof.role, name: prof.name || '', email: prof.email || session.user.email };
  const go = new URLSearchParams(location.search).get('go');
  if (go) {
    history.replaceState(null, '', location.pathname);
    location.hash = '#' + go;
  }
  route();
}

function renderLogin(errMsg) {
  me = null;
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-logo"><div class="logo-tile"><img src="logo.png" alt="GluciAI" /></div>
          <div><div class="login-title">GluciAI</div><div style="font-size:11px;color:var(--muted-2);font-weight:700;letter-spacing:.08em;text-transform:uppercase">Dashboard</div></div>
        </div>
        <p class="login-sub">Espace réservé aux médecins et à l'administration.</p>
        <div class="login-error ${errMsg ? 'show' : ''}" id="lerr">${esc(errMsg || '')}</div>
        <form id="lform">
          <div class="field"><label>Email</label><input type="email" id="lemail" required autocomplete="email" placeholder="docteur@exemple.com" /></div>
          <div class="field"><label>Mot de passe</label><input type="password" id="lpass" required autocomplete="current-password" placeholder="••••••••" /></div>
          <button class="btn btn-primary btn-block" id="lbtn" type="submit">Se connecter</button>
        </form>
        <p class="login-hint">🔒 Connexion sécurisée · Les patients utilisent l'application mobile GluciAI.</p>
      </div>
    </div>`;
  document.getElementById('lform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('lbtn');
    const err = document.getElementById('lerr');
    btn.disabled = true; btn.textContent = 'Connexion…'; err.classList.remove('show');
    const { error } = await db.auth.signInWithPassword({
      email: document.getElementById('lemail').value.trim(),
      password: document.getElementById('lpass').value,
    });
    if (error) {
      err.textContent = 'Email ou mot de passe incorrect.'; err.classList.add('show');
      btn.disabled = false; btn.textContent = 'Se connecter';
      return;
    }
    boot();
  });
}

/* ── Shell ── */
const NAV = [
  { hash: '#/', label: 'Dashboard', icon: I.dash, roles: ['admin', 'doctor'] },
  { hash: '#/users', label: 'Utilisateurs', icon: I.group, roles: ['admin'] },
  { hash: '#/patients', label: 'Patients', icon: I.users, roles: ['admin', 'doctor'] },
  { hash: '#/doctors', label: 'Médecins', icon: I.steth, roles: ['admin'] },
  { hash: '#/promos', label: 'Codes promo', icon: I.tag, roles: ['admin', 'doctor'] },
  { hash: '#/subs', label: 'Abonnements', icon: I.card, roles: ['admin'] },
  { hash: '#/usage', label: 'Conso IA', icon: I.cpu, roles: ['admin', 'doctor'] },
];

function shell(active, title, sub, bodyHTML) {
  const items = NAV.filter((n) => n.roles.includes(me.role));
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-head">
          <div class="logo-tile sm"><img src="logo.png" alt="GluciAI" /></div>
          <div><div class="name">GluciAI</div><div class="sub">Dashboard médical</div></div>
        </div>
        <nav>${items.map((n) => `<a class="nav-item ${n.hash === active ? 'active' : ''}" href="${n.hash}">${n.icon}<span>${n.label}</span></a>`).join('')}</nav>
        <div class="sidebar-foot">
          <div class="user-chip">
            ${avatar(me.name, me.email)}
            <div class="who"><div class="n">${esc(me.role === 'doctor' ? 'Dr. ' + (me.name || me.email) : me.name || me.email)}</div><div class="r">${me.role === 'admin' ? 'Administrateur' : 'Médecin'}</div></div>
            <button class="icon-btn" id="logoutBtn" title="Se déconnecter">${I.logout}</button>
          </div>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <button class="icon-btn burger" id="burger">${I.menu}</button>
          <div><h1>${title}</h1><div class="sub">${sub || ''}</div></div>
          <div class="spacer"></div>
        </div>
        <div class="content" id="page">${bodyHTML || ''}</div>
      </div>
    </div>`;
  document.getElementById('logoutBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    // Drop our in-memory identity FIRST so any stray route() call bails out.
    me = null;
    // Clear the local session even if the server revoke fails or throws
    // (offline / already-expired token) — otherwise a stale session lingers
    // and boot() bounces us back into the dashboard.
    try { await db.auth.signOut(); } catch (_) { /* local session is cleared regardless */ }
    // Reset the URL WITHOUT firing hashchange → route → boot (that re-entry
    // races renderLogin and can re-render the dashboard on a stale read).
    // replaceState does not emit hashchange, so we land on login deterministically.
    history.replaceState(null, '', location.pathname);
    renderLogin();
  });
  const burger = document.getElementById('burger');
  burger?.addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('open');
    if (sb.classList.contains('open')) {
      const bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      bd.addEventListener('click', () => { sb.classList.remove('open'); bd.remove(); });
      document.querySelector('.shell').appendChild(bd);
    } else document.querySelector('.sidebar-backdrop')?.remove();
  });
  return document.getElementById('page');
}

const todayStr = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const loading = `<div style="display:grid;gap:14px"><div class="skel" style="height:96px"></div><div class="skel" style="height:200px"></div><div class="skel" style="height:260px"></div></div>`;

/* ── Router ── */
async function route() {
  if (!me) return boot();
  // Stop the day-report auto-refresh of the page we're leaving.
  if (window.__dayTimer) { clearInterval(window.__dayTimer); window.__dayTimer = null; }
  const h = location.hash || '#/';
  const mPatient = h.match(/^#\/patient\/([\w-]+)(?:\/(\w+))?/);
  const mDoctor = h.match(/^#\/doctor\/([\w-]+)/);
  const mUser = h.match(/^#\/user\/([\w-]+)/);
  try {
    if (mPatient) return await pagePatient(mPatient[1], mPatient[2]);
    // Médecins et admins ouvrent la MÊME fiche complète que les patients.
    if (mDoctor && me.role === 'admin') return await pagePatient(mDoctor[1]);
    if (mUser && me.role === 'admin') return await pagePatient(mUser[1]);
    if (h.startsWith('#/users') && me.role === 'admin') return await pageUsers();
    if (h.startsWith('#/patients')) return await pagePatients();
    if (h.startsWith('#/doctors') && me.role === 'admin') return await pageDoctors();
    if (h.startsWith('#/promos')) return await pagePromos();
    if (h.startsWith('#/subs') && me.role === 'admin') return await pageSubs();
    if (h.startsWith('#/usage')) return await pageUsage();
    return await pageOverview();
  } catch (e) {
    console.error(e);
    toast('Erreur de chargement', true);
  }
}
window.addEventListener('hashchange', route);

/* ── Data fetchers ── */
const fetchPatients = async () =>
  (await db.from('patient_overview').select('*').order('created_at', { ascending: false })).data ?? [];
const fetchDoctors = async () =>
  (await db.from('doctor_overview').select('*').order('created_at', { ascending: false })).data ?? [];

/* ════════════════ OVERVIEW ════════════════ */
async function pageOverview() {
  const page = shell('#/', 'Dashboard', todayStr(), loading);
  const since = new Date(Date.now() - 13 * 86400000);
  since.setHours(0, 0, 0, 0);
  const [patients, doctors, promos, scans14, gly14] = await Promise.all([
    fetchPatients(),
    me.role === 'admin' ? fetchDoctors() : Promise.resolve([]),
    db.from('promo_codes').select('id,uses_count').then((r) => r.data ?? []),
    db.from('meal_scans').select('created_at').gte('created_at', since.toISOString()).then((r) => r.data ?? []),
    db.from('glucose_logs').select('created_at').gte('created_at', since.toISOString()).then((r) => r.data ?? []),
  ]);

  const totMeals = patients.reduce((a, p) => a + (p.meals_count || 0), 0);
  const totGly = patients.reduce((a, p) => a + (p.glucose_count || 0), 0);
  const activeSubs = patients.filter((p) => p.status === 'active' && (!p.expires_at || new Date(p.expires_at) > new Date())).length;

  const stats = me.role === 'admin'
    ? [
        { l: 'Patients', v: patients.length, icon: I.users, tone: 'indigo' },
        { l: 'Médecins', v: doctors.length, icon: I.steth, tone: 'violet' },
        { l: 'Scans repas', v: totMeals, icon: I.scan, tone: 'blue' },
        { l: 'Mesures glycémie', v: totGly, icon: I.drop, tone: 'red' },
        { l: 'Abonnés actifs', v: activeSubs, icon: I.card, tone: 'green' },
        { l: 'Codes promo', v: promos.length, icon: I.tag, tone: 'amber' },
      ]
    : [
        { l: 'Mes patients', v: patients.length, icon: I.users, tone: 'indigo' },
        { l: 'Scans repas', v: totMeals, icon: I.scan, tone: 'blue' },
        { l: 'Mesures glycémie', v: totGly, icon: I.drop, tone: 'red' },
        { l: 'Mes codes promo', v: promos.length, icon: I.tag, tone: 'amber' },
      ];

  // 14-day chart buckets
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    days.push({ key: d.toDateString(), label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), scans: 0, gly: 0 });
  }
  const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
  scans14.forEach((r) => { const k = new Date(r.created_at).toDateString(); if (byKey[k]) byKey[k].scans++; });
  gly14.forEach((r) => { const k = new Date(r.created_at).toDateString(); if (byKey[k]) byKey[k].gly++; });

  const recent = [...patients]
    .sort((a, b) => new Date(b.last_activity || b.created_at || 0) - new Date(a.last_activity || a.created_at || 0))
    .slice(0, 6);

  page.innerHTML = `
    <div style="display:grid;gap:16px">
      <div class="card card-pad welcome fade-up">
        <div>
          <div class="hi">${new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir'} 👋</div>
          <h2>${esc(me.role === 'doctor' ? 'Dr. ' + (me.name || me.email) : me.name || 'Admin')}</h2>
          <div class="role">${me.role === 'admin' ? 'Administrateur · accès complet' : 'Médecin · vos patients uniquement'}</div>
        </div>
        <div style="font-size:12px;color:var(--muted)"><span class="live-dot"></span>Système opérationnel</div>
      </div>

      <div class="stats-grid fade-up" style="animation-delay:.05s">
        ${stats.map((s) => `<div class="card stat-card"><div class="sc-body"><div class="l">${s.l}</div><div class="v">${s.v}</div></div><div class="ic tone-${s.tone}">${s.icon}</div></div>`).join('')}
      </div>

      <div class="card fade-up" style="animation-delay:.1s">
        <div class="card-head"><h3>Activité des 14 derniers jours</h3><span class="hint">scans & glycémies</span></div>
        <div class="chart-legend"><span><span class="dot" style="background:var(--primary)"></span>Scans repas</span><span><span class="dot" style="background:var(--green)"></span>Glycémies</span></div>
        <div class="chart-box">${barChart(days)}</div>
      </div>

      <div class="card fade-up" style="animation-delay:.15s">
        <div class="card-head"><h3>Derniers patients actifs</h3><a href="#/patients" style="font-size:12px;font-weight:700;color:var(--primary)">Tout voir ›</a></div>
        ${patientTable(recent)}
      </div>
    </div>`;
  bindPatientRows(page);
}

function barChart(days) {
  const W = 980, H = 180, pad = 6, bw = W / days.length;
  const max = Math.max(1, ...days.map((d) => Math.max(d.scans, d.gly)));
  const bars = days.map((d, i) => {
    const x = i * bw + pad;
    const w = (bw - pad * 2 - 4) / 2;
    const h1 = Math.round((d.scans / max) * (H - 46));
    const h2 = Math.round((d.gly / max) * (H - 46));
    return `
      <rect x="${x}" y="${H - 26 - Math.max(h1, 2)}" width="${w}" height="${Math.max(h1, 2)}" rx="3" fill="var(--primary)" opacity="${d.scans ? 1 : 0.18}"/>
      <rect x="${x + w + 4}" y="${H - 26 - Math.max(h2, 2)}" width="${w}" height="${Math.max(h2, 2)}" rx="3" fill="var(--green)" opacity="${d.gly ? 1 : 0.18}"/>
      <text x="${x + (bw - pad * 2) / 2}" y="${H - 8}" font-size="9.5" fill="#94a3b8" text-anchor="middle" font-weight="600">${d.label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${bars}</svg>`;
}

/* ════════════════ PATIENTS ════════════════ */
function patientTable(rows, opts = {}) {
  if (!rows.length) return `<div class="empty"><div class="e">🩺</div><div class="t">Aucun patient</div><div class="s">Les patients apparaîtront ici dès leur inscription.</div></div>`;
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th>Patient</th>${me.role === 'admin' && !opts.hideDoctor ? '<th>Médecin</th>' : ''}<th>Type</th><th>Abonnement</th><th>État glycémie</th><th>Scans</th><th>Glycémies</th><th>Connexion</th><th>Activité</th><th></th></tr></thead>
    <tbody>
      ${rows.map((p) => {
        const fl = glyFlag(p);
        return `
        <tr class="click" data-pid="${p.user_id}">
          <td><div class="cell-user">${avatar(p.name, p.email)}<div style="min-width:0"><div class="nm">${esc(p.name || 'Sans nom')}</div><div class="em">${esc(p.email || '')}</div></div></div></td>
          ${me.role === 'admin' && !opts.hideDoctor ? `<td>${p.doctor_name ? `<span class="badge violet">Dr. ${esc(p.doctor_name)}</span>` : '<span class="badge gray">—</span>'}</td>` : ''}
          <td>${p.diabetes_type ? `<span class="badge indigo">${esc(String(p.diabetes_type).replace('type', 'Type '))}</span>` : '—'}</td>
          <td>${subBadge(p)}</td>
          <td><span class="badge ${fl.cls}">${fl.label}</span></td>
          <td><b>${p.meals_count ?? 0}</b></td>
          <td><b>${p.glucose_count ?? 0}</b></td>
          <td style="color:var(--muted);font-size:12px" title="${p.last_seen_at ? fmtDT(p.last_seen_at) : ''}">${p.last_seen_at ? timeAgo(p.last_seen_at) : '—'}</td>
          <td style="color:var(--muted);font-size:12px" title="${p.last_activity ? fmtDT(p.last_activity) : ''}">${p.last_activity ? timeAgo(p.last_activity) : '—'}</td>
          <td style="color:var(--muted-2);width:20px">${I.chevR}</td>
        </tr>`;
      }).join('')}
    </tbody></table></div>`;
}
function bindPatientRows(scope) {
  scope.querySelectorAll('tr[data-pid]').forEach((tr) =>
    tr.addEventListener('click', () => { location.hash = `#/patient/${tr.dataset.pid}`; }));
}

async function pagePatients() {
  const page = shell('#/patients', 'Patients', 'Tous les patients et leurs données', loading);
  const patients = await fetchPatients();
  const doctors = me.role === 'admin' ? await fetchDoctors() : [];

  // The list currently shown after all filters — the "envoi groupé" alert
  // targets exactly this set, so the admin sees who will receive it.
  let currentList = patients;

  const renderList = () => {
    const q = (document.getElementById('psearch')?.value || '').trim().toLowerCase();
    const fDoc = document.getElementById('fDoc')?.value || '';
    const fSub = document.getElementById('fSub')?.value || '';
    const fState = document.getElementById('fState')?.value || '';
    const fConn = document.getElementById('fConn')?.value || '';
    const fAct = document.getElementById('fAct')?.value || '';
    let f = patients;
    if (q) f = f.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.doctor_name || '').toLowerCase().includes(q));
    if (fDoc === 'none') f = f.filter((p) => !p.doctor_id);
    else if (fDoc) f = f.filter((p) => p.doctor_id === fDoc);
    if (fSub) f = f.filter((p) => statusOf(p) === fSub);
    if (fState) f = f.filter((p) => glyFlag(p).level === fState);
    if (fConn) f = f.filter((p) => inTimeBucket(p.last_seen_at, fConn));
    if (fAct) f = f.filter((p) => inTimeBucket(p.last_activity, fAct));
    currentList = f;
    document.getElementById('plist').innerHTML = patientTable(f);
    bindPatientRows(document.getElementById('plist'));
    document.getElementById('pcount').textContent = `${f.length} / ${patients.length}`;
    const bulk = document.getElementById('bulkAlert');
    if (bulk) bulk.textContent = `📢 Alerte (${f.length})`;
  };

  page.innerHTML = `
    <div class="page-actions fade-up">
      <div class="search-bar">${I.search}<input id="psearch" placeholder="Rechercher un patient…" /></div>
      ${me.role === 'admin' ? `
      <select class="sel" id="fDoc">
        <option value="">👨‍⚕️ Tous les médecins</option>
        <option value="none">Sans médecin</option>
        ${doctors.map((d) => `<option value="${d.user_id}">Dr. ${esc(d.name || d.email)}</option>`).join('')}
      </select>` : ''}
      <select class="sel" id="fSub">
        <option value="">💳 Tous les abonnements</option>
        <option value="active">Actif</option>
        <option value="trial">Essai</option>
        <option value="unpaid">Impayé</option>
        <option value="expired">Expiré</option>
        <option value="canceled">Annulé</option>
        <option value="none">Aucun</option>
      </select>
      <select class="sel" id="fState">
        <option value="">🩸 État glycémie</option>
        <option value="critique">🔴 Critique</option>
        <option value="surveiller">🟠 À surveiller</option>
        <option value="ok">🟢 OK</option>
        <option value="none">Sans donnée</option>
      </select>
      <select class="sel" id="fConn">
        <option value="">📲 Dernière connexion</option>
        <option value="today">Aujourd'hui</option>
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="old">+ de 30 jours</option>
        <option value="never">Jamais connecté</option>
      </select>
      <select class="sel" id="fAct">
        <option value="">⏱️ Dernière activité</option>
        <option value="today">Aujourd'hui</option>
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="old">+ de 30 jours</option>
        <option value="never">Aucune activité</option>
      </select>
      <span class="badge gray" id="pcount"></span>
      <div class="spacer" style="flex:1"></div>
      <button class="btn btn-ghost" id="bulkAlert">📢 Alerte</button>
      <button class="btn btn-primary" id="addPatient">${I.plus} Ajouter un patient</button>
    </div>
    <div class="card fade-up" style="animation-delay:.05s" id="plist"></div>`;
  renderList();
  document.getElementById('psearch').addEventListener('input', renderList);
  document.getElementById('fDoc')?.addEventListener('change', renderList);
  document.getElementById('fSub')?.addEventListener('change', renderList);
  document.getElementById('fState')?.addEventListener('change', renderList);
  document.getElementById('fConn')?.addEventListener('change', renderList);
  document.getElementById('fAct')?.addEventListener('change', renderList);
  document.getElementById('addPatient').addEventListener('click', () => addUserModal('patient', doctors, () => pagePatients()));
  document.getElementById('bulkAlert').addEventListener('click', () => alertModal(currentList));
}

function addUserModal(kind, doctors, onDone, forcedDoctorId) {
  const isDoc = kind === 'doctor';
  const ov = modal(`
    <div class="modal-head"><h3>${isDoc ? 'Ajouter un médecin' : 'Ajouter un patient'}</h3><button class="icon-btn" data-close>${I.x}</button></div>
    <div class="modal-body">
      <div class="field"><label>Nom complet</label><input id="mName" placeholder="${isDoc ? 'Dr. Karim Alaoui' : 'Prénom Nom'}" /></div>
      <div class="field"><label>Email</label><input id="mEmail" type="email" placeholder="email@exemple.com" /></div>
      <div class="field"><label>Mot de passe (min. 6 caractères)</label><input id="mPass" type="text" placeholder="Mot de passe provisoire" /></div>
      ${!isDoc && me.role === 'admin' && !forcedDoctorId
        ? `<div class="field"><label>Médecin référent (optionnel)</label><select id="mDoctor"><option value="">— Aucun —</option>${(doctors || []).map((d) => `<option value="${d.user_id}">Dr. ${esc(d.name || d.email)}</option>`).join('')}</select></div>`
        : ''}
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" id="mGo">Créer le compte</button></div>`);
  ov.querySelector('#mGo').addEventListener('click', async () => {
    const btn = ov.querySelector('#mGo');
    btn.disabled = true; btn.textContent = 'Création…';
    const res = await adminOp({
      action: 'create_user',
      email: ov.querySelector('#mEmail').value,
      password: ov.querySelector('#mPass').value,
      name: ov.querySelector('#mName').value,
      role: isDoc ? 'doctor' : 'patient',
      doctor_id: forcedDoctorId || ov.querySelector('#mDoctor')?.value || null,
    });
    if (!res.ok) { toast(res.error || 'Erreur', true); btn.disabled = false; btn.textContent = 'Créer le compte'; return; }
    ov.remove(); toast(isDoc ? 'Médecin créé ✓' : 'Patient créé ✓'); onDone?.();
  });
}

/* ════════════════ ALERTE IN-APP ════════════════
   Envoie un message à un patient (ou à toute une liste filtrée). Il s'affiche
   au centre de l'écran dans l'app, avec un bouton de contact optionnel :
     support → ouvre le WhatsApp support   |   doctor → appelle son médecin. */
function alertModal(target, onDone) {
  const recipients = (Array.isArray(target) ? target : [target]).filter((p) => p && p.user_id);
  const n = recipients.length;
  if (!n) { toast('Aucun destinataire', true); return; }
  const who = n === 1
    ? `<b>${esc(recipients[0].name || recipients[0].email || 'ce patient')}</b>`
    : `<b>${n} patient${n > 1 ? 's' : ''}</b> (liste filtrée actuelle)`;
  const ov = modal(`
    <div class="modal-head"><h3>📢 Envoyer une alerte</h3><button class="icon-btn" data-close>${I.x}</button></div>
    <div class="modal-body">
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:12px;line-height:1.5">
        Destinataire : ${who}.<br />Le message s'affiche <b>au centre de l'écran</b> dans l'application du patient.
      </div>
      <div class="field"><label>Titre (optionnel)</label><input id="alTitle" maxlength="80" placeholder="Ex. Message de votre équipe" /></div>
      <div class="field"><label>Message</label><textarea id="alBody" rows="4" maxlength="500" placeholder="Écrivez votre message…" style="resize:vertical;font:inherit;width:100%;border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;background:#fbfcfe"></textarea></div>
      <div class="field"><label>Bouton de contact</label>
        <select id="alCta">
          <option value="none">Aucun — juste « OK »</option>
          <option value="support">📞 Contacter le support (WhatsApp)</option>
          <option value="doctor">👨‍⚕️ Contacter le médecin (appel)</option>
        </select>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" id="alGo">Envoyer${n > 1 ? ` à ${n}` : ''}</button></div>`);
  ov.querySelector('#alGo').addEventListener('click', async () => {
    const body = ov.querySelector('#alBody').value.trim();
    const title = ov.querySelector('#alTitle').value.trim();
    const cta = ov.querySelector('#alCta').value;
    if (!body) { toast('Le message est vide', true); return; }
    const btn = ov.querySelector('#alGo');
    btn.disabled = true; btn.textContent = 'Envoi…';
    const rows = recipients.map((p) => ({ user_id: p.user_id, title: title || null, body, cta, created_by: me.id }));
    const { error } = await db.from('app_alerts').insert(rows);
    if (error) { btn.disabled = false; btn.textContent = 'Envoyer'; toast('Erreur: ' + error.message, true); return; }
    ov.remove();
    toast(n === 1 ? 'Alerte envoyée ✓' : `Alerte envoyée à ${n} patients ✓`);
    onDone?.();
  });
}

/* ════════════════ FICHE COMPTE (patient, médecin ou admin) ════════════════
   Une seule fiche pour TOUS les rôles : les médecins et les admins (y compris
   votre propre compte) montrent exactement les mêmes données que les patients
   — rapport du jour, repas scannés, chat, appels, analyses, options… Les
   sections abonnement/paiements/médecin référent restent réservées aux
   patients ; la fiche d'un médecin ajoute ses codes promo et ses patients. */
async function pagePatient(pid, initTab) {
  let page = shell('#/patients', 'Fiche patient', '', loading);
  const [ovRes, profRes, subRes, featRes, doctors] = await Promise.all([
    db.from('patient_overview').select('*').eq('user_id', pid).maybeSingle(),
    db.from('profiles').select('*').eq('user_id', pid).maybeSingle(),
    db.from('subscriptions').select('*').eq('user_id', pid).maybeSingle(),
    db.from('feature_access').select('*').eq('user_id', pid),
    me.role === 'admin' ? fetchDoctors() : Promise.resolve([]),
  ]);
  const prof = profRes.data;
  if (!prof) { page.innerHTML = `<div class="empty"><div class="e">🔍</div><div class="t">Compte introuvable</div></div>`; return; }
  const role = prof.role || 'patient';
  const isPatient = role === 'patient';
  const ov = ovRes.data ?? {}; // les médecins/admins ne sont pas dans patient_overview
  if (!isPatient) {
    page = shell(role === 'doctor' ? '#/doctors' : '#/users',
      role === 'doctor' ? 'Fiche médecin' : 'Fiche administrateur',
      'Toutes les données du compte — comme une fiche patient', loading);
  }
  const sub = subRes.data;
  const locks = Object.fromEntries((featRes.data ?? []).map((f) => [f.feature, f.allowed]));
  // Fiche médecin : ses codes promo et les patients qu'il suit.
  const [docCodes, docPatients] = role === 'doctor'
    ? await Promise.all([
        db.from('promo_codes').select('*').eq('doctor_id', pid).order('created_at', { ascending: false }).then((r) => r.data ?? []),
        fetchPatients().then((ps) => ps.filter((p) => p.doctor_id === pid)),
      ])
    : [[], []];

  const [mealsRes, glysRes, insus, acts, meas, payments, chats, calls, labRes] = await Promise.all([
    db.from('meal_scans').select('*', { count: 'exact' }).eq('user_id', pid).order('created_at', { ascending: false }).limit(60).then((r) => ({ rows: r.data ?? [], count: r.count ?? (r.data ?? []).length })),
    db.from('glucose_logs').select('*', { count: 'exact' }).eq('user_id', pid).order('created_at', { ascending: false }).limit(80).then((r) => ({ rows: r.data ?? [], count: r.count ?? (r.data ?? []).length })),
    db.from('insulin_logs').select('*').eq('user_id', pid).order('created_at', { ascending: false }).limit(80).then((r) => r.data ?? []),
    db.from('activity_logs').select('*').eq('user_id', pid).order('created_at', { ascending: false }).limit(60).then((r) => r.data ?? []),
    db.from('measure_logs').select('*').eq('user_id', pid).order('created_at', { ascending: false }).limit(60).then((r) => r.data ?? []),
    db.from('payments').select('*').eq('user_id', pid).order('period', { ascending: false }).then((r) => r.data ?? []),
    db.from('chat_history').select('*').eq('user_id', pid).order('created_at', { ascending: true }).limit(300).then((r) => r.data ?? []),
    db.from('call_logs').select('*').eq('user_id', pid).order('created_at', { ascending: false }).limit(100).then((r) => r.data ?? []),
    db.from('lab_reports').select('*', { count: 'exact' }).eq('user_id', pid).order('created_at', { ascending: false }).limit(50).then((r) => ({ rows: r.data ?? [], count: r.count ?? (r.data ?? []).length })),
  ]);
  const meals = mealsRes.rows, mealsCount = mealsRes.count;
  const glys = glysRes.rows, glysCount = glysRes.count;
  const labReports = labRes.rows;
  const labsCount = labRes.count;
  const aiUsage = (await db.from('ai_usage').select('kind, input_tokens, output_tokens, audio_input_tokens, audio_output_tokens, cost_usd').eq('user_id', pid)).data ?? [];
  // Live usage-limit status (override→default resolved, with used/remaining)
  // + the per-user override rows, so the card can flag custom vs default.
  const usageStatus = (await db.rpc('usage_status', { p_user: pid })).data ?? [];
  const usageOverrides = (await db.from('usage_limits').select('*').eq('user_id', pid)).data ?? [];
  // Voice-call minutes consumed this calendar month (quota tracking).
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const callSecMonth = calls
    .filter((c) => new Date(c.created_at).getTime() >= monthStart)
    .reduce((a, c) => a + (c.duration_sec || 0), 0);
  const callMinMonth = Math.ceil(callSecMonth / 60);
  const callLimit = sub?.call_minutes_limit ?? null;

  const week = Date.now() - 7 * 86400000;
  const gly7 = glys.filter((g) => new Date(g.created_at).getTime() > week);
  const avg7 = gly7.length ? Math.round(gly7.reduce((a, g) => a + Number(g.value), 0) / gly7.length) : null;
  const tir = gly7.length ? Math.round((gly7.filter((g) => g.value >= (prof.target_low || 70) && g.value <= (prof.target_high || 180)).length / gly7.length) * 100) : null;
  const insu7 = insus.filter((x) => new Date(x.created_at).getTime() > week).reduce((a, x) => a + Number(x.dose || 0), 0);

  const dl = daysLeft(sub?.expires_at);
  const effPrice = sub ? Math.max(0, Number(sub.price || 0) * (1 - Number(sub.discount_pct || 0) / 100)) : 0;

  page.innerHTML = `
    <div style="display:grid;gap:16px">
      <div class="page-actions fade-up" style="margin-bottom:0">
        <button class="btn btn-ghost" id="backBtn">${I.back} Retour</button>
        <div class="spacer" style="flex:1"></div>
        ${isPatient ? `<button class="btn btn-ghost" id="alertBtn">📢 Envoyer une alerte</button>` : ''}
        ${me.role === 'admin' ? `<button class="btn btn-ghost" id="pwBtn">${I.key} Mot de passe</button>${pid !== me.id ? `<button class="btn btn-danger" id="delBtn">${I.trash} Supprimer</button>` : ''}` : ''}
      </div>

      <div class="card card-pad fade-up" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        ${avatar(prof.name, prof.email, true)}
        <div style="flex:1;min-width:220px">
          <div style="font-size:18px;font-weight:800">${esc((role === 'doctor' ? 'Dr. ' : '') + (prof.name || 'Sans nom'))}</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:2px">${esc(prof.email || '')} · inscrit le ${fmtDate(prof.created_at)}</div>
          <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">
            ${!isPatient ? (ROLE_BADGE[role] || '') : ''}
            ${pid === me.id ? '<span class="badge green">C\'est vous</span>' : ''}
            ${prof.diabetes_type ? `<span class="badge indigo">${esc(String(prof.diabetes_type).replace('type', 'Type '))}</span>` : ''}
            ${prof.language ? `<span class="badge gray">${esc(String(prof.language).toUpperCase())}</span>` : ''}
            ${ov.doctor_name ? `<span class="badge violet">Dr. ${esc(ov.doctor_name)}</span>` : ''}
            ${prof.promo_code_used ? `<span class="badge amber">Code ${esc(prof.promo_code_used)}</span>` : ''}
            ${prof.phone ? `<span class="badge blue">📱 ${esc(prof.phone)}</span>` : '<span class="badge gray">📱 —</span>'}
            ${isPatient ? subBadge(ov) : ''}
          </div>
        </div>
        ${prof.phone ? `<a class="btn btn-ghost" style="text-decoration:none" target="_blank" rel="noopener"
            href="${waHref(prof.phone, prof.language, `Bonjour ${prof.name || ''} 👋, ici l'équipe GluciAI.`)}">💬 WhatsApp</a>` : ''}
      </div>

      <div class="stats-grid fade-up">
        <div class="card stat-card"><div class="sc-body"><div class="l">Repas scannés</div><div class="v">${mealsCount}</div></div><div class="ic tone-blue">${I.scan}</div></div>
        <div class="card stat-card"><div class="sc-body"><div class="l">Glycémies</div><div class="v">${glysCount}</div></div><div class="ic tone-red">${I.drop}</div></div>
        <div class="card stat-card"><div class="sc-body"><div class="l">Moy. 7j (mg/dL)${tir !== null ? ` · TIR ${tir}%` : ''}</div><div class="v">${avg7 ?? '—'}</div></div><div class="ic tone-green">${I.pulse}</div></div>
        <div class="card stat-card"><div class="sc-body"><div class="l">Insuline 7j (U)</div><div class="v">${Math.round(insu7 * 10) / 10}</div></div><div class="ic tone-violet">${I.syringe}</div></div>
        <div class="card stat-card"><div class="sc-body"><div class="l">Analyses labo</div><div class="v">${labsCount}</div></div><div class="ic tone-amber" style="font-size:19px">🧪</div></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px" class="fade-up">
        ${isPatient ? `
        <div class="card">
          <div class="card-head"><h3>💳 Abonnement</h3>${me.role === 'admin' ? `<button class="btn btn-ghost" style="height:32px;padding:0 12px;font-size:12px" id="editSub">Modifier</button>` : ''}</div>
          <div class="info-grid">
            <div class="info-cell"><div class="k">Plan</div><div class="v">${PLAN_LABEL[sub?.plan] || 'Gratuit'}</div></div>
            <div class="info-cell"><div class="k">Statut</div><div class="v">${subBadge(sub)}</div></div>
            <div class="info-cell"><div class="k">Prix</div><div class="v">${sub?.price ? `${effPrice.toFixed(2)} €${sub.discount_pct ? ` <span style="color:var(--green-text);font-size:11px">(-${sub.discount_pct}%)</span>` : ''}` : '—'}</div></div>
            <div class="info-cell"><div class="k">Payé</div><div class="v">${sub ? (sub.paid ? '<span class="badge green">Payé ✓</span>' : '<span class="badge red">Non payé</span>') : '—'}</div></div>
            <div class="info-cell"><div class="k">Montant payé</div><div class="v">${sub?.paid_amount ? Number(sub.paid_amount).toFixed(2) + ' €' : '—'}</div></div>
            <div class="info-cell"><div class="k">Expire</div><div class="v">${sub?.expires_at ? `${fmtDate(sub.expires_at)}${dl !== null ? ` <span style="font-size:11px;color:${dl < 0 ? 'var(--red-text)' : dl <= 7 ? 'var(--amber-text)' : 'var(--muted-2)'}">(${dl < 0 ? 'expiré' : 'dans ' + dl + ' j'})</span>` : ''}` : '—'}</div></div>
          </div>
        </div>` : ''}

        <div class="card">
          <div class="card-head"><h3>🔐 Accès aux fonctionnalités</h3><span class="hint">${me.role === 'admin' ? 'cliquez pour bloquer/débloquer' : 'lecture seule'}</span></div>
          <div id="featList">
            ${FEATURES.map((f) => {
              const on = locks[f.key] !== false;
              return `<div class="feature-row">
                <div class="fic" style="background:${f.bg}">${f.icon}</div>
                <div class="ft"><div class="t">${f.label}</div><div class="d">${f.desc}</div></div>
                ${on ? '' : '<span class="badge red">🔒 Bloqué</span>'}
                <button class="switch ${on ? 'on' : ''}" data-feat="${f.key}" ${me.role !== 'admin' ? 'disabled' : ''}></button>
              </div>`;
            }).join('')}
            ${me.role === 'admin' ? `
            <div style="margin:14px 0 6px;padding-top:12px;border-top:1px dashed var(--border);font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--muted-2)">
              🕶️ Fonctions cachées — invisibles pour le patient tant que vous ne les activez pas
            </div>
            ${HIDDEN_FEATURES.map((f) => {
              const on = locks[f.key] === true;
              return `<div class="feature-row">
                <div class="fic" style="background:${f.bg}">${f.icon}</div>
                <div class="ft"><div class="t">${f.label}</div><div class="d">${f.desc}</div></div>
                ${on ? '<span class="badge green">👁️ Activée</span>' : '<span class="badge">🕶️ Cachée</span>'}
                <button class="switch ${on ? 'on' : ''}" data-feat="${f.key}" data-hidden="1"></button>
              </div>`;
            }).join('')}
            <div style="margin:14px 0 6px;padding-top:12px;border-top:1px dashed var(--border);font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--muted-2)">
              📚 Rubriques de contenu — visibles par défaut, masquez-les pour ce patient (aucun écran de blocage)
            </div>
            ${CONTENT_SECTIONS.map((f) => {
              const on = locks[f.key] !== false;
              return `<div class="feature-row">
                <div class="fic" style="background:${f.bg}">${f.icon}</div>
                <div class="ft"><div class="t">${f.label}</div><div class="d">${f.desc}</div></div>
                ${on ? '' : '<span class="badge">🙈 Masquée</span>'}
                <button class="switch ${on ? 'on' : ''}" data-feat="${f.key}" data-content="1"></button>
              </div>`;
            }).join('')}` : ''}
          </div>
        </div>
      </div>

      ${me.role === 'admin' && isPatient ? `
      <div class="card fade-up">
        <div class="card-head"><h3>👨‍⚕️ Médecin référent</h3></div>
        <div class="card-pad" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <select id="docSel" style="flex:1;min-width:200px;height:40px;border:1.5px solid var(--border);border-radius:10px;padding:0 12px;font-size:13px;background:#fbfcfe">
            <option value="">— Aucun médecin —</option>
            ${doctors.map((d) => `<option value="${d.user_id}" ${prof.doctor_id === d.user_id ? 'selected' : ''}>Dr. ${esc(d.name || d.email)}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="docSave">Enregistrer</button>
        </div>
      </div>` : ''}

      ${isPatient ? paymentsCard(sub, payments) : ''}

      ${usageLimitsCard(usageStatus, usageOverrides, me.role === 'admin')}

      ${usageCard(aiUsage)}

      <div class="card fade-up">
        <div class="card-head">
          <h3>📆 Rapport du jour</h3>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="hint" style="margin-right:4px">identique à l'app du patient</span>
            <button class="btn" id="dayPrev" title="Jour précédent" style="padding:6px 12px">‹</button>
            <input type="date" id="dayPick" style="height:34px;border:1.5px solid var(--border);border-radius:9px;padding:0 8px;font-size:12.5px;background:#fbfcfe" />
            <button class="btn" id="dayNext" title="Jour suivant" style="padding:6px 12px">›</button>
            <button class="btn" id="dayRefresh" title="Actualiser maintenant" style="padding:6px 12px">↻</button>
          </div>
        </div>
        <div id="dayPanel" style="padding:14px 18px 18px">
          <div style="color:var(--muted);font-size:12.5px">Chargement…</div>
        </div>
      </div>

      <div class="card fade-up">
        <div class="card-head">
          <div class="tabs" id="dataTabs">
            ${[
              ['meals', `🍽️ Repas (${meals.length})`],
              ['gly', `🩸 Glycémie (${glys.length})`],
              ['insu', `💉 Insuline (${insus.length})`],
              ['act', `🏃 Activité (${acts.length})`],
              ['meas', `📏 Mesures (${meas.length})`],
              ['labs', `🧪 Analyses (${labsCount})`],
              ['chat', `💬 Chat IA (${Math.ceil(chats.length / 2)})`],
              ['calls', `📞 Appels (${calls.length})`],
            ].map(([k, label]) => `<button class="tab ${k === (initTab || 'meals') ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('')}
          </div>
        </div>
        <div id="dataPanel"></div>
      </div>

      ${role === 'doctor' ? `
      <div class="card fade-up">
        <div class="card-head"><h3>🎟️ Codes promo</h3>${me.role === 'admin' ? `<button class="btn btn-primary" style="height:34px;font-size:12px" id="addCode">${I.plus} Générer un code</button>` : ''}</div>
        <div id="codesBox">${promoTable(docCodes, { hideDoctor: true })}</div>
      </div>
      <div class="card fade-up">
        <div class="card-head"><h3>🩺 Patients suivis</h3><span class="hint">liés par code promo ou assignés</span></div>
        ${patientTable(docPatients, { hideDoctor: true })}
      </div>` : ''}

      <div class="card fade-up">
        <div class="card-head"><h3>📋 Profil médical</h3></div>
        <div class="info-grid">
          <div class="info-cell"><div class="k">Naissance</div><div class="v">${fmtDate(prof.birth_date)}</div></div>
          <div class="info-cell"><div class="k">Genre</div><div class="v">${esc(prof.gender || '—')}</div></div>
          <div class="info-cell"><div class="k">Taille</div><div class="v">${prof.height ? prof.height + ' cm' : '—'}</div></div>
          <div class="info-cell"><div class="k">Poids</div><div class="v">${prof.weight ? prof.weight + ' kg' : '—'}</div></div>
          <div class="info-cell"><div class="k">Cible</div><div class="v">${prof.target_low || 70}–${prof.target_high || 180}</div></div>
          <div class="info-cell"><div class="k">Ratio glucides</div><div class="v">${prof.carb_ratio ? '1U / ' + prof.carb_ratio + ' g' : '—'}</div></div>
          <div class="info-cell"><div class="k">Correction</div><div class="v">${prof.correction_factor ? '1U / ' + prof.correction_factor : '—'}</div></div>
          <div class="info-cell"><div class="k">Insulines</div><div class="v">${(prof.insulin_types || []).join(', ') || '—'}</div></div>
          <div class="info-cell"><div class="k">Médecin (déclaré)</div><div class="v">${esc(prof.doctor_name || '—')}</div></div>
          <div class="info-cell"><div class="k">Urgence</div><div class="v">${esc(prof.emergency_contact_name || '—')}${prof.emergency_contact_phone ? ' · ' + esc(prof.emergency_contact_phone) : ''}</div></div>
        </div>
      </div>
    </div>`;

  document.getElementById('backBtn').addEventListener('click', () => history.back());
  document.getElementById('alertBtn')?.addEventListener('click', () =>
    alertModal({ user_id: pid, name: prof.name, email: prof.email }));

  /* data tabs */
  const panel = document.getElementById('dataPanel');
  const tabRenders = {
    meals: () => meals.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Photo</th><th>Date</th><th>Repas</th><th>Kcal</th><th>Glucides</th><th>Sucre</th><th>IG</th><th>Score</th></tr></thead><tbody>
      ${meals.map((m) => {
        const r = m.result || {};
        const names = r.food_name || (r.items || []).map((i) => i.name).join(', ') || '—';
        const hasPhoto = m.image_url && /^https?:/i.test(m.image_url);
        const photo = hasPhoto
          ? `<img class="meal-thumb" src="${esc(m.image_url)}" data-photo="${esc(m.image_url)}" data-cap="${esc(names)}" loading="lazy" alt="" />`
          : `<div class="meal-thumb ph">🍽️</div>`;
        return `<tr><td style="width:52px">${photo}</td><td style="white-space:nowrap;color:var(--muted);font-size:12px">${fmtDT(m.created_at)}</td><td style="max-width:240px"><b>${esc(names)}</b></td><td>${Math.round(m.calories ?? r.calories ?? 0)}</td><td><b>${Math.round(m.carbs ?? r.carbohydrates ?? 0)} g</b></td><td>${Math.round(m.sugar ?? r.sugar ?? 0)} g</td><td>${m.glycemic_index ?? r.glycemic_index ?? '—'}</td><td>${r.meal_score != null ? `<span class="badge ${r.meal_score >= 70 ? 'green' : r.meal_score >= 45 ? 'amber' : 'red'}">${r.meal_score}/100</span>` : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>` : emptyData('🍽️', 'Aucun repas scanné'),
    gly: () => glys.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Valeur</th><th>Source</th><th>Notes</th></tr></thead><tbody>
      ${glys.map((g) => `<tr><td style="white-space:nowrap;color:var(--muted);font-size:12px">${fmtDT(g.created_at)}</td><td>${glyBadge(g.value)}</td><td style="color:var(--muted)">${esc(g.source || 'manuel')}</td><td style="color:var(--muted)">${esc(g.notes || '—')}</td></tr>`).join('')}</tbody></table></div>` : emptyData('🩸', 'Aucune mesure de glycémie'),
    insu: () => insus.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Type</th><th>Dose</th><th>Notes</th></tr></thead><tbody>
      ${insus.map((x) => `<tr><td style="white-space:nowrap;color:var(--muted);font-size:12px">${fmtDT(x.created_at)}</td><td><span class="badge violet">${esc(x.insulin_type || '—')}</span></td><td><b>${x.dose} U</b></td><td style="color:var(--muted)">${esc(x.notes || '—')}</td></tr>`).join('')}</tbody></table></div>` : emptyData('💉', "Aucune dose d'insuline"),
    act: () => acts.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Activité</th><th>Durée</th><th>Intensité</th></tr></thead><tbody>
      ${acts.map((a) => `<tr><td style="white-space:nowrap;color:var(--muted);font-size:12px">${fmtDT(a.created_at)}</td><td><b>${esc(a.kind || '—')}</b></td><td>${a.duration_min ?? '—'} min</td><td>${esc(a.intensity || '—')}</td></tr>`).join('')}</tbody></table></div>` : emptyData('🏃', 'Aucune activité'),
    meas: () => meas.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Mesure</th><th>Valeur</th></tr></thead><tbody>
      ${meas.map((x) => `<tr><td style="white-space:nowrap;color:var(--muted);font-size:12px">${fmtDT(x.created_at)}</td><td><b>${esc(x.kind || '—')}</b></td><td>${x.value} ${esc(x.unit || '')}</td></tr>`).join('')}</tbody></table></div>` : emptyData('📏', 'Aucune mesure'),
    chat: () => {
      if (!chats.length) return emptyData('💬', "Aucune conversation avec l'IA");
      let lastDay = '';
      const rows = chats.map((c) => {
        const day = new Date(c.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        const sep = day !== lastDay ? `<div style="align-self:center;font-size:10.5px;font-weight:700;color:var(--muted-2);text-transform:capitalize;margin:8px 0 2px">${day}</div>` : '';
        lastDay = day;
        const time = new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return `${sep}<div class="bub ${c.role === 'user' ? 'u' : 'a'}">${esc(c.message)}<div class="bt">${time}</div></div>`;
      }).join('');
      return `<div class="chat-box" id="chatBox">${rows}</div>`;
    },
    labs: () => {
      // How much the patient used the lab-analysis feature + what it cost in AI.
      const labUse = aiUsage.filter((r) => r.kind === 'lab');
      const labCost = labUse.reduce((a, r) => a + Number(r.cost_usd || 0), 0);
      const strip = `<div class="pay-stats" style="padding-bottom:2px">
        <span class="badge indigo">🧪 ${labsCount} analyse${labsCount > 1 ? 's' : ''} envoyée${labsCount > 1 ? 's' : ''}</span>
        <span class="badge violet">${labUse.length} requête${labUse.length > 1 ? 's' : ''} IA</span>
        <span class="badge green">Coût IA : ${fmtUsd(labCost)}</span>
      </div>`;
      if (!labReports.length) return strip + emptyData('🧪', 'Aucune analyse biologique envoyée');
      const S = { ok: ['#10b981', 'Normal'], warn: ['#f59e0b', 'Attention'], danger: ['#ef4444', 'Critique'] };
      return strip + `<div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">
        ${labReports.map((rep) => {
          const vals = Array.isArray(rep.values) ? rep.values : [];
          const ok = vals.filter((v) => v.status === 'ok').length;
          const warn = vals.filter((v) => v.status === 'warn').length;
          const danger = vals.filter((v) => v.status === 'danger').length;
          const thumb = rep.image_thumb
            ? `<img class="meal-thumb" src="${esc(rep.image_thumb)}" data-photo="${esc(rep.image_thumb)}" data-cap="${esc(rep.lab_name || 'Analyse')}" style="width:56px;height:56px" alt="" />`
            : `<div class="meal-thumb ph" style="width:56px;height:56px">🧪</div>`;
          return `<div style="border:1.5px solid var(--border);border-radius:14px;overflow:hidden">
            <div style="display:flex;gap:12px;align-items:center;padding:12px 14px;background:#fbfcfe">
              ${thumb}
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px">${esc(rep.lab_name || 'Analyse biologique')}</div>
                <div style="font-size:11px;color:var(--muted)">${rep.report_date ? 'Rapport du ' + fmtDate(rep.report_date) + ' · ' : ''}envoyée le ${fmtDT(rep.created_at)}</div>
                ${rep.summary ? `<div style="font-size:11.5px;color:var(--muted);font-style:italic;margin-top:3px">${esc(rep.summary)}</div>` : ''}
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                ${danger ? `<span class="badge red">${danger} crit.</span>` : ''}
                ${warn ? `<span class="badge amber">${warn} att.</span>` : ''}
                <span class="badge green">${ok} norm.</span>
              </div>
            </div>
            ${vals.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Examen</th><th>Valeur</th><th>Référence</th><th>Statut</th><th>Catégorie</th></tr></thead><tbody>
              ${vals.map((v) => `<tr>
                <td><b>${esc(v.label || '—')}</b></td>
                <td><b style="color:${(S[v.status] || S.ok)[0]}">${esc(String(v.value ?? ''))} ${esc(v.unit || '')}</b></td>
                <td style="color:var(--muted);font-size:12px">${v.refMin ?? '?'} – ${v.refMax ?? '?'} ${esc(v.unit || '')}</td>
                <td><span class="badge ${v.status === 'danger' ? 'red' : v.status === 'warn' ? 'amber' : 'green'}">${(S[v.status] || S.ok)[1]}</span></td>
                <td style="color:var(--muted);font-size:12px">${esc(v.category || '—')}</td>
              </tr>`).join('')}</tbody></table></div>` : ''}
            ${rep.medical_report ? `<details style="border-top:1px solid var(--border)">
              <summary style="cursor:pointer;padding:10px 14px;font-size:12.5px;font-weight:700;color:var(--muted)">🩺 Rapport médical généré par l'IA</summary>
              <div style="padding:4px 16px 14px;font-size:12.5px;line-height:1.65;white-space:pre-wrap">${esc(rep.medical_report)}</div>
            </details>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    },
    calls: () => {
      if (!calls.length) return emptyData('📞', 'Aucun appel vocal avec l’IA');
      const total = calls.reduce((a, c) => a + (c.duration_sec || 0), 0);
      return `
        <div class="pay-stats" style="padding-bottom:2px">
          <span class="badge indigo">${calls.length} appel${calls.length > 1 ? 's' : ''}</span>
          <span class="badge green">Total ${fmtDur(total)} min</span>
          <span class="badge gray">Moyenne ${fmtDur(Math.round(total / calls.length))}</span>
        </div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Heure</th><th>Durée</th><th>Langue</th></tr></thead><tbody>
        ${calls.map((c) => `<tr>
          <td style="color:var(--muted);font-size:12px">${fmtDate(c.created_at)}</td>
          <td style="color:var(--muted);font-size:12px">${new Date(c.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td><span class="badge ${c.duration_sec >= 180 ? 'amber' : 'green'}">⏱ ${fmtDur(c.duration_sec)}</span></td>
          <td>${c.language ? `<span class="badge gray">${esc(String(c.language).toUpperCase())}</span>` : '—'}</td>
        </tr>`).join('')}</tbody></table></div>`;
    },
  };
  const emptyDataFn = tabRenders;
  panel.innerHTML = (tabRenders[initTab] || tabRenders.meals)();
  {
    const cb = document.getElementById('chatBox');
    if (cb) cb.scrollTop = cb.scrollHeight;
  }
  panel.addEventListener('click', (e) => {
    const ph = e.target.closest('[data-photo]');
    if (ph) lightbox(ph.dataset.photo, ph.dataset.cap);
  });

  /* ── Rapport du jour : EXACTEMENT ce que le patient voit dans son écran
     "Rapport du jour" (timeline de l'app) — un fil chronologique de TOUT
     ce qu'il a fait ce jour-là (repas, insuline, glycémies, sport, mesures,
     analyses labo, notes, changements d'état/réglages), du plus récent au
     plus ancien. S'actualise seul chaque minute sur le jour courant. ── */
  const dayPanel = document.getElementById('dayPanel');
  const dayPick = document.getElementById('dayPick');
  // Date ISO LOCALE (pas toISOString, qui décale le jour en UTC).
  const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  dayPick.value = toIso(new Date());
  dayPick.max = toIso(new Date());

  const ST_LABEL = { active: 'Actif', sick: 'Malade', injured: 'Blessé', paused: 'En pause' };
  const F_LABEL = {
    diabetes_type: 'Type de diabète', insulin_types: 'Insulines', target_low: 'Cible basse',
    target_high: 'Cible haute', carb_ratio: 'Ratio glucides', correction_factor: 'Facteur de correction',
    weight: 'Poids', height: 'Taille',
  };
  const chVal = (v) => (Array.isArray(v) ? v.join('+') : v ?? '—');

  async function loadDayReport(dateStr, silent) {
    if (!silent) dayPanel.innerHTML = '<div style="color:var(--muted);font-size:12.5px">Chargement…</div>';
    // Bornes du jour en heure LOCALE — le même découpage que l'app du patient.
    const d0 = new Date(dateStr + 'T00:00:00');
    const from = d0.toISOString();
    const to = new Date(d0.getTime() + 86400000).toISOString();
    const between = (q) => q.gte('created_at', from).lt('created_at', to);
    const [dm, dg, di, da, dx, de_, dlab] = await Promise.all([
      between(db.from('meal_scans').select('*').eq('user_id', pid)).then((r) => r.data ?? []),
      between(db.from('glucose_logs').select('*').eq('user_id', pid)).then((r) => r.data ?? []),
      between(db.from('insulin_logs').select('*').eq('user_id', pid)).then((r) => r.data ?? []),
      between(db.from('activity_logs').select('*').eq('user_id', pid)).then((r) => r.data ?? []),
      between(db.from('measure_logs').select('*').eq('user_id', pid)).then((r) => r.data ?? []),
      between(db.from('event_logs').select('*').eq('user_id', pid)).then((r) => r.data ?? []),
      between(db.from('lab_reports').select('*').eq('user_id', pid)).then((r) => r.data ?? []),
    ]);
    const time = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    /* Totaux du jour — les mêmes chiffres que la barre de totaux de l'app */
    const totCarbs = dm.reduce((a, m) => a + Number(m.carbs ?? m.result?.carbohydrates ?? 0), 0);
    const totKcal = dm.reduce((a, m) => a + Number(m.calories ?? m.result?.calories ?? 0), 0);
    const totSugar = dm.reduce((a, m) => a + Number(m.sugar ?? m.result?.sugar ?? 0), 0);
    const rapidU = di.filter((x) => x.insulin_type === 'rapid').reduce((a, x) => a + Number(x.dose || 0), 0);
    const longU = di.filter((x) => x.insulin_type === 'long').reduce((a, x) => a + Number(x.dose || 0), 0);
    const totIns = di.reduce((a, x) => a + Number(x.dose || 0), 0);
    const sportMin = da.reduce((a, x) => a + Number(x.duration_min || 0), 0);
    const avgGly = dg.length ? Math.round(dg.reduce((a, g) => a + Number(g.value), 0) / dg.length) : null;

    /* Fil unique, du plus récent au plus ancien — comme l'app */
    const feed = [
      ...dm.map((m) => ({ t: m.created_at, type: 'meal', m })),
      ...dg.map((g) => ({ t: g.created_at, type: 'gly', g })),
      ...di.map((x) => ({ t: x.created_at, type: 'insu', x })),
      ...da.map((a) => ({ t: a.created_at, type: 'act', a })),
      ...dx.map((x) => ({ t: x.created_at, type: 'meas', x })),
      ...de_.map((e) => ({ t: e.created_at, type: 'ev', e })),
      ...dlab.map((l) => ({ t: l.created_at, type: 'lab', l })),
    ].sort((a, b) => new Date(b.t) - new Date(a.t));

    const stamp = `<div style="font-size:10.5px;color:var(--muted-2);margin-top:10px">↻ Mis à jour à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · actualisation automatique chaque minute</div>`;

    if (!feed.length) {
      dayPanel.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:18px 0">📭 Rien d\'enregistré ce jour-là</div>' + stamp;
      return;
    }

    const card = (color, icon, title, meta, right = '') => `
      <div class="tl-card">
        <div class="tl-ic" style="background:${color}1c">${icon}</div>
        <div style="flex:1;min-width:0"><div class="tl-t">${title}</div><div class="tl-m">${meta}</div></div>
        ${right}
      </div>`;

    const rows = feed.map((e) => {
      let color = '#64748b', inner = '';
      if (e.type === 'meal') {
        const r = e.m.result || {};
        const names = r.food_name || (r.items || []).map((i) => i.name).slice(0, 3).join(', ') || 'Repas';
        const thumb = e.m.image_url && /^https?:/i.test(e.m.image_url)
          ? `<img class="meal-thumb" src="${esc(e.m.image_url)}" data-photo="${esc(e.m.image_url)}" data-cap="${esc(names)}" loading="lazy" alt="" />` : '';
        color = '#3b82f6';
        inner = card(color, '🍽️', `${e.m.meal_type ? esc(e.m.meal_type) + ' · ' : ''}${esc(names)}`,
          `${Math.round(e.m.calories ?? r.calories ?? 0)} kcal · ${Math.round(e.m.carbs ?? r.carbohydrates ?? 0)} g gluc. · ${Math.round(e.m.sugar ?? r.sugar ?? 0)} g sucre`, thumb);
      } else if (e.type === 'insu') {
        color = '#8b5cf6';
        inner = card(color, '💉', `${e.x.dose} U · ${esc(e.x.insulin_type === 'rapid' ? 'rapide' : e.x.insulin_type === 'long' ? 'lente' : e.x.insulin_type || 'insuline')}`, esc(e.x.notes || 'Insuline'));
      } else if (e.type === 'gly') {
        color = '#ef4444';
        inner = card(color, '🩸', glyBadge(e.g.value), esc(e.g.notes || 'Glycémie'));
      } else if (e.type === 'act') {
        color = '#10b981';
        inner = card(color, '🏃', `${esc(e.a.kind || 'Sport')} · ${e.a.duration_min ?? '—'} min`, `Activité · ${esc(e.a.intensity || '—')}`);
      } else if (e.type === 'meas') {
        color = '#f59e0b';
        inner = card(color, '📏', `${esc(e.x.kind || 'Mesure')} · ${e.x.value} ${esc(e.x.unit || '')}`, 'Mesure corporelle');
      } else if (e.type === 'lab') {
        const vals = Array.isArray(e.l.values) ? e.l.values : [];
        const danger = vals.filter((v) => v.status === 'danger').length;
        const warn = vals.filter((v) => v.status === 'warn').length;
        const thumb = e.l.image_thumb
          ? `<img class="meal-thumb" src="${esc(e.l.image_thumb)}" data-photo="${esc(e.l.image_thumb)}" data-cap="${esc(e.l.lab_name || 'Analyse')}" loading="lazy" alt="" />` : '';
        color = '#d946ef';
        inner = card(color, '🧪', esc(e.l.lab_name || 'Analyse biologique'),
          `${vals.length} valeur${vals.length > 1 ? 's' : ''}${danger ? ` · <b style="color:var(--red-text)">${danger} critique${danger > 1 ? 's' : ''}</b>` : ''}${warn ? ` · <b style="color:var(--amber-text)">${warn} à surveiller</b>` : ''} · <a href="#/patient/${pid}/labs" style="color:var(--primary);font-weight:700">détails</a>`, thumb);
      } else if (e.type === 'ev') {
        const k = e.e.kind, p = e.e.payload || {};
        if (k === 'note') { color = '#0ea5e9'; inner = card(color, '📝', 'Note du patient', `“${esc(p.text || '')}”`); }
        else if (k === 'status') { color = '#f97316'; inner = card(color, '🩺', "Changement d'état", `${ST_LABEL[p.from] || esc(String(p.from ?? '—'))} → <b>${ST_LABEL[p.to] || esc(String(p.to ?? '—'))}</b>`); }
        else { inner = card(color, '⚙️', 'Réglages médicaux modifiés', Object.entries(p.changes ?? {}).map(([f, v]) => `${F_LABEL[f] || esc(f)} : ${esc(String(chVal(v?.from)))} → <b>${esc(String(chVal(v?.to)))}</b>`).join(' · ') || '—'); }
      }
      return `<div class="tl-row"><div class="tl-time">${time(e.t)}</div><div class="tl-spine"><div class="tl-dot" style="background:${color}"></div></div>${inner}</div>`;
    }).join('');

    dayPanel.innerHTML = `
      <div class="pay-stats" style="padding:0 0 10px">
        <span class="badge indigo">🍽️ ${dm.length} repas · ${Math.round(totCarbs)} g gluc. · ${Math.round(totKcal)} kcal · ${Math.round(totSugar)} g sucre</span>
        <span class="badge violet">💉 ${Math.round(totIns * 10) / 10} U${totIns ? ` (${Math.round(rapidU * 10) / 10} rapide / ${Math.round(longU * 10) / 10} lente)` : ''}</span>
        <span class="badge gray">🩸 ${dg.length} mesure${dg.length > 1 ? 's' : ''}${avgGly !== null ? ` · moy. ${avgGly}` : ''}</span>
        ${sportMin ? `<span class="badge green">🏃 ${sportMin} min</span>` : ''}
        ${dlab.length ? `<span class="badge amber">🧪 ${dlab.length} analyse${dlab.length > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="tl-feed">${rows}</div>${stamp}`;
  }
  const shiftDay = (n) => {
    const d = new Date(dayPick.value + 'T00:00:00');
    d.setDate(d.getDate() + n);
    if (toIso(d) > dayPick.max) return;
    dayPick.value = toIso(d);
    loadDayReport(dayPick.value);
  };
  document.getElementById('dayPrev').addEventListener('click', () => shiftDay(-1));
  document.getElementById('dayNext').addEventListener('click', () => shiftDay(1));
  document.getElementById('dayRefresh').addEventListener('click', () => loadDayReport(dayPick.value));
  dayPick.addEventListener('change', () => dayPick.value && loadDayReport(dayPick.value));
  dayPanel.addEventListener('click', (e) => {
    const ph = e.target.closest('[data-photo]');
    if (ph) lightbox(ph.dataset.photo, ph.dataset.cap);
  });
  loadDayReport(dayPick.value);
  // Live : tant que la fiche affiche AUJOURD'HUI, on recharge chaque minute —
  // ce que le patient vient de faire dans l'app apparaît tout seul ici.
  if (window.__dayTimer) clearInterval(window.__dayTimer);
  window.__dayTimer = setInterval(() => {
    if (!document.body.contains(dayPanel)) { clearInterval(window.__dayTimer); window.__dayTimer = null; return; }
    if (dayPick.value === toIso(new Date())) loadDayReport(dayPick.value, true);
  }, 60000);
  document.querySelectorAll('#dataTabs .tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('#dataTabs .tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      panel.innerHTML = emptyDataFn[t.dataset.tab]();
      const cb = document.getElementById('chatBox');
      if (cb) cb.scrollTop = cb.scrollHeight;
    }));

  /* payments (admin edits, doctor views) */
  if (me.role === 'admin') {
    const effAmount = sub ? Math.max(0, Number(sub.price || 0) * (1 - Number(sub.discount_pct || 0) / 100)) : 0;
    document.getElementById('addPay')?.addEventListener('click', () =>
      payModal(pid, null, effAmount, () => pagePatient(pid)));
    document.querySelectorAll('[data-payid]').forEach((chip) =>
      chip.addEventListener('click', () => {
        const p = payments.find((x) => x.id === chip.dataset.payid);
        if (p) payModal(pid, p, effAmount, () => pagePatient(pid));
      }));
    document.querySelectorAll('[data-payperiod]').forEach((chip) =>
      chip.addEventListener('click', () =>
        payModal(pid, { period: chip.dataset.payperiod + '-01' }, effAmount, () => pagePatient(pid))));
  }

  /* feature toggles */
  if (me.role === 'admin') {
    document.querySelectorAll('#featList .switch').forEach((sw) =>
      sw.addEventListener('click', async () => {
        const feat = sw.dataset.feat;
        const hidden = sw.dataset.hidden === '1';
        const content = sw.dataset.content === '1';
        const nowOn = !sw.classList.contains('on');
        sw.classList.toggle('on', nowOn);
        const { error } = await db.from('feature_access').upsert({ user_id: pid, feature: feat, allowed: nowOn, updated_at: new Date().toISOString() });
        if (error) { sw.classList.toggle('on', !nowOn); toast('Erreur: ' + error.message, true); return; }
        toast(hidden
          ? (nowOn ? 'Fonction cachée activée pour ce patient 👁️' : 'Fonction cachée désactivée 🕶️')
          : content
            ? (nowOn ? 'Rubrique visible dans l\'app 👁️' : 'Rubrique masquée pour ce patient 🙈')
            : (nowOn ? 'Fonctionnalité débloquée ✓' : 'Fonctionnalité bloquée 🔒'));
        const row = sw.closest('.feature-row');
        row.querySelector('.badge')?.remove();
        if (hidden) sw.insertAdjacentHTML('beforebegin', nowOn ? '<span class="badge green">👁️ Activée</span>' : '<span class="badge">🕶️ Cachée</span>');
        else if (content) { if (!nowOn) sw.insertAdjacentHTML('beforebegin', '<span class="badge">🙈 Masquée</span>'); }
        else if (!nowOn) sw.insertAdjacentHTML('beforebegin', '<span class="badge red">🔒 Bloqué</span>');
      }));

    /* usage-limit overrides (per feature): save = upsert, reset = drop override */
    document.querySelectorAll('#ulimitList .ul-save').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const row = btn.closest('.ulimit-row');
        const feature = row.dataset.feat;
        const raw = row.querySelector('.ul-val').value;
        const payload = {
          user_id: pid,
          feature,
          limit_value: raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0),
          period: row.querySelector('.ul-per').value,
          updated_at: new Date().toISOString(),
        };
        btn.disabled = true;
        const { error } = await db.from('usage_limits').upsert(payload);
        if (error) { btn.disabled = false; return toast('Erreur: ' + error.message, true); }
        toast('Limite enregistrée ✓'); pagePatient(pid);
      }));
    document.querySelectorAll('#ulimitList .ul-reset').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const feature = btn.closest('.ulimit-row').dataset.feat;
        const { error } = await db.from('usage_limits').delete().eq('user_id', pid).eq('feature', feature);
        if (error) return toast('Erreur: ' + error.message, true);
        toast('Revenu au défaut ✓'); pagePatient(pid);
      }));

    document.getElementById('editSub')?.addEventListener('click', () => subModal(pid, sub, () => pagePatient(pid)));
    document.getElementById('docSave')?.addEventListener('click', async () => {
      const v = document.getElementById('docSel').value || null;
      const { error } = await db.from('profiles').update({ doctor_id: v }).eq('user_id', pid);
      if (error) return toast('Erreur: ' + error.message, true);
      toast('Médecin mis à jour ✓'); pagePatient(pid);
    });
    document.getElementById('pwBtn')?.addEventListener('click', () => passwordModal(pid));
    document.getElementById('delBtn')?.addEventListener('click', () => deleteUserModal(pid, prof.name || prof.email, () => {
      location.hash = isPatient ? '#/patients' : role === 'doctor' ? '#/doctors' : '#/users';
    }));
  }

  /* fiche médecin : codes promo + patients suivis */
  if (role === 'doctor') {
    document.getElementById('addCode')?.addEventListener('click', () =>
      promoModal([{ user_id: pid, name: prof.name, email: prof.email }], pid, () => pagePatient(pid)));
    bindPromoRows(page, () => pagePatient(pid));
    bindPatientRows(page);
  }
}
const emptyData = (e, t) => `<div class="empty"><div class="e">${e}</div><div class="t">${t}</div></div>`;

/* ── Usage limits card (patient detail): per-feature quota + live bar ── */
function limitBar(used, limit, unlimited) {
  const pct = unlimited ? 100 : limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = unlimited ? '#10b98188' : pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#10b981';
  return `<div style="height:8px;background:#eef1f5;border-radius:5px;overflow:hidden">
    <div style="height:100%;width:${pct}%;background:${color};border-radius:5px;transition:width .4s"></div></div>`;
}

function usageLimitsCard(status, overrides, isAdmin) {
  const byFeat = Object.fromEntries((status ?? []).map((s) => [s.feature, s]));
  const ov = Object.fromEntries((overrides ?? []).map((o) => [o.feature, o]));
  const PERIODS = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']];
  return `
    <div class="card fade-up">
      <div class="card-head"><h3>🎚️ Limites d'utilisation</h3><span class="hint">${isAdmin ? 'quota jour / semaine / mois — vide = illimité' : 'lecture seule'}</span></div>
      <div id="ulimitList" style="display:grid;gap:14px;padding:6px 2px 2px">
        ${USAGE_LIMIT_FEATURES.map((f) => {
          const s = byFeat[f.key] ?? {};
          const isCustom = !!ov[f.key];
          const limit = s.limit ?? null;
          const period = s.period ?? 'day';
          const used = s.used ?? 0;
          const unlimited = limit == null;
          return `<div class="ulimit-row" data-feat="${f.key}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <div class="fic" style="background:${f.bg};width:34px;height:34px">${f.icon}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px">${f.label}
                  <span style="font-size:10.5px;color:var(--muted-2);font-weight:600">· ${isCustom ? 'personnalisé' : 'défaut'}</span></div>
                <div style="font-size:11.5px;color:var(--muted)">${unlimited ? 'Illimité' : `${used} / ${limit} ${f.unit}`} · ${PERIOD_LABEL[period]}</div>
              </div>
            </div>
            ${limitBar(used, limit ?? 0, unlimited)}
            ${isAdmin ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px">
              <input class="ul-val" type="number" min="0" step="1" placeholder="∞ illimité" value="${limit ?? ''}"
                style="width:120px;height:34px;border:1.5px solid var(--border);border-radius:9px;padding:0 10px;font-size:13px" />
              <select class="ul-per" style="height:34px;border:1.5px solid var(--border);border-radius:9px;padding:0 8px;font-size:13px;background:#fbfcfe">
                ${PERIODS.map(([k, v]) => `<option value="${k}" ${period === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
              <button class="btn btn-primary ul-save" style="height:34px;padding:0 14px;font-size:12px">Enregistrer</button>
              ${isCustom ? `<button class="btn btn-ghost ul-reset" style="height:34px;padding:0 10px;font-size:12px">↺ défaut</button>` : ''}
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

/* ── Global default limits editor (Conso IA page, admin only) ── */
async function defaultLimitsCardHTML() {
  const { data } = await db.from('usage_default_limits').select('*');
  const by = Object.fromEntries((data ?? []).map((d) => [d.feature, d]));
  const PERIODS = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']];
  return `<div class="card fade-up" style="margin-bottom:16px">
    <div class="card-head"><h3>🎚️ Limites par défaut</h3><span class="hint">appliquées à tous — sauf override par utilisateur</span></div>
    <div id="defLimitList" style="display:grid;gap:10px;padding:8px 2px 2px">
      ${USAGE_LIMIT_FEATURES.map((f) => {
        const d = by[f.key] ?? {};
        return `<div class="def-row" data-feat="${f.key}" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="fic" style="background:${f.bg};width:30px;height:30px">${f.icon}</div>
          <div style="flex:1;min-width:120px;font-weight:600;font-size:12.5px">${f.label}
            <span style="color:var(--muted-2);font-weight:500">(${f.unit})</span></div>
          <input class="def-val" type="number" min="0" step="1" placeholder="∞ illimité" value="${d.limit_value ?? ''}"
            style="width:110px;height:32px;border:1.5px solid var(--border);border-radius:8px;padding:0 8px;font-size:12.5px" />
          <select class="def-per" style="height:32px;border:1.5px solid var(--border);border-radius:8px;padding:0 6px;font-size:12.5px;background:#fbfcfe">
            ${PERIODS.map(([k, v]) => `<option value="${k}" ${(d.period ?? 'day') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>`;
      }).join('')}
    </div>
    <div style="padding:12px 2px 2px"><button class="btn btn-primary" id="defSave">Enregistrer les défauts</button></div>
  </div>`;
}

function bindDefaultLimits() {
  document.getElementById('defSave')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    const rows = [...document.querySelectorAll('#defLimitList .def-row')].map((r) => {
      const v = r.querySelector('.def-val').value;
      return {
        feature: r.dataset.feat,
        limit_value: v === '' ? null : Math.max(0, parseInt(v, 10) || 0),
        period: r.querySelector('.def-per').value,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await db.from('usage_default_limits').upsert(rows);
    btn.disabled = false;
    if (error) return toast('Erreur: ' + error.message, true);
    toast('Limites par défaut enregistrées ✓');
  });
}

/* ── AI consumption card (patient detail) ── */
function usageCard(rows, callInfo) {
  const totalCost = rows.reduce((a, r) => a + Number(r.cost_usd || 0), 0);
  const byKind = {};
  rows.forEach((r) => {
    const k = (byKind[r.kind] ??= { n: 0, in: 0, out: 0, cost: 0 });
    k.n++;
    k.in += (r.input_tokens || 0) + (r.audio_input_tokens || 0);
    k.out += (r.output_tokens || 0) + (r.audio_output_tokens || 0);
    k.cost += Number(r.cost_usd || 0);
  });
  // Monthly voice-call quota chip
  let quotaChip = '';
  if (callInfo) {
    const { callMinMonth, callLimit } = callInfo;
    if (callLimit == null) {
      quotaChip = `<span class="badge gray">📞 ${callMinMonth} min ce mois · illimité</span>`;
    } else {
      const left = Math.max(0, callLimit - callMinMonth);
      const cls = left === 0 ? 'red' : left <= Math.max(2, callLimit * 0.2) ? 'amber' : 'green';
      quotaChip = `<span class="badge ${cls}">📞 ${callMinMonth}/${callLimit} min ce mois · ${left} restantes</span>`;
    }
  }
  return `
    <div class="card fade-up">
      <div class="card-head"><h3>🧮 Consommation IA</h3><a href="#/usage" style="font-size:12px;font-weight:700;color:var(--primary)">Vue globale ›</a></div>
      ${quotaChip ? `<div class="pay-stats" style="padding-bottom:0">${quotaChip}</div>` : ''}
      ${rows.length ? `
      <div class="pay-stats" style="padding-bottom:2px">
        <span class="badge indigo">Coût total : ${fmtUsd(totalCost)}</span>
        <span class="badge gray">${rows.length} requête${rows.length > 1 ? 's' : ''}</span>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Fonction</th><th>Requêtes</th><th>Tokens entrée</th><th>Tokens sortie</th><th>Coût</th></tr></thead>
        <tbody>${Object.entries(byKind).map(([k, v]) => `
          <tr><td><b>${KIND_META[k]?.icon ?? '🤖'} ${KIND_META[k]?.label ?? esc(k)}</b></td>
          <td>${v.n}</td><td>${fmtTok(v.in)}</td><td>${fmtTok(v.out)}</td>
          <td><b style="color:var(--primary)">${fmtUsd(v.cost)}</b></td></tr>`).join('')}</tbody>
      </table></div>`
      : `<div class="empty" style="padding:26px 20px"><div class="e">🧮</div><div class="t">Aucune utilisation IA enregistrée</div><div class="s">Le suivi exact est actif depuis le 11 juillet 2026.</div></div>`}
    </div>`;
}

/* ── Monthly payments card (patient detail) ── */
function paymentsCard(sub, payments) {
  const due = monthsDue(sub);
  const paidByMonth = Object.fromEntries(payments.map((p) => [String(p.period).slice(0, 7), p]));
  // Months owed but with no payment row = unpaid
  const unpaid = due.filter((k) => !paidByMonth[k]);
  const totalPaid = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const isAdmin = me.role === 'admin';

  // Show newest first: merge due months + any extra paid months outside the range
  const allKeys = [...new Set([...due, ...Object.keys(paidByMonth)])].sort().reverse();

  const chips = allKeys.map((k) => {
    const p = paidByMonth[k];
    if (p) {
      return `<div class="month-chip paid ${isAdmin ? 'click' : ''}" ${isAdmin ? `data-payid="${p.id}"` : ''} title="${esc(p.method || '')}">
        <div class="m">${fmtMonth(k)}</div><div class="a">✓ ${Number(p.amount).toFixed(2)} €</div>
      </div>`;
    }
    return `<div class="month-chip unpaid ${isAdmin ? 'click' : ''}" ${isAdmin ? `data-payperiod="${k}"` : ''}>
      <div class="m">${fmtMonth(k)}</div><div class="a">✗ Impayé</div>
    </div>`;
  }).join('');

  return `
    <div class="card fade-up">
      <div class="card-head">
        <h3>💰 Historique des paiements</h3>
        ${isAdmin ? `<button class="btn btn-primary" style="height:34px;font-size:12px" id="addPay">${I.plus} Paiement</button>` : ''}
      </div>
      ${allKeys.length ? `
        <div class="pay-stats">
          <span class="badge green">${payments.length} mois payé${payments.length > 1 ? 's' : ''}</span>
          ${unpaid.length ? `<span class="badge red">${unpaid.length} mois impayé${unpaid.length > 1 ? 's' : ''}</span>` : '<span class="badge gray">Aucun impayé</span>'}
          <span class="badge indigo">Total encaissé : ${totalPaid.toFixed(2)} €</span>
        </div>
        <div class="months-grid">${chips}</div>`
      : `<div class="empty"><div class="e">💰</div><div class="t">Aucun paiement</div><div class="s">${sub?.starts_at ? 'Ajoutez le premier paiement du patient.' : "Renseignez d'abord la date de début de l'abonnement."}</div></div>`}
    </div>`;
}

function payModal(pid, existing, defaultAmount, onDone) {
  const isEdit = !!existing?.id;
  const period = existing?.period ? String(existing.period).slice(0, 7) : monthKey(new Date());
  const ov = modal(`
    <div class="modal-head"><h3>${isEdit ? 'Modifier le paiement' : 'Enregistrer un paiement'}</h3><button class="icon-btn" data-close>${I.x}</button></div>
    <div class="modal-body">
      <div class="field"><div class="row2">
        <div><label>Mois</label><input id="pMonth" type="month" value="${period}" ${isEdit ? 'disabled' : ''} /></div>
        <div><label>Montant (€)</label><input id="pAmount" type="number" step="0.01" value="${existing?.amount ?? defaultAmount.toFixed(2)}" /></div>
      </div></div>
      <div class="field"><label>Méthode</label><select id="pMethod">
        ${['Espèces', 'Carte', 'Virement', 'Autre'].map((m) => `<option ${existing?.method === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select></div>
      <div class="field"><label>Notes (optionnel)</label><input id="pNotes" value="${esc(existing?.notes || '')}" /></div>
    </div>
    <div class="modal-foot">
      ${isEdit ? `<button class="btn btn-danger" id="pDel" style="margin-right:auto">${I.trash} Supprimer</button>` : ''}
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="pGo">${isEdit ? 'Enregistrer' : 'Marquer payé ✓'}</button>
    </div>`);
  ov.querySelector('#pGo').addEventListener('click', async () => {
    const btn = ov.querySelector('#pGo'); btn.disabled = true;
    const month = ov.querySelector('#pMonth').value;
    if (!month) { toast('Choisissez un mois', true); btn.disabled = false; return; }
    const { error } = await db.from('payments').upsert({
      user_id: pid,
      period: month + '-01',
      amount: Number(ov.querySelector('#pAmount').value || 0),
      method: ov.querySelector('#pMethod').value,
      notes: ov.querySelector('#pNotes').value || null,
    }, { onConflict: 'user_id,period' });
    if (error) { toast('Erreur: ' + error.message, true); btn.disabled = false; return; }
    ov.remove(); toast('Paiement enregistré ✓'); onDone?.();
  });
  ov.querySelector('#pDel')?.addEventListener('click', async () => {
    const { error } = await db.from('payments').delete().eq('id', existing.id);
    if (error) return toast('Erreur: ' + error.message, true);
    ov.remove(); toast('Paiement supprimé'); onDone?.();
  });
}

function subModal(pid, sub, onDone) {
  const ov = modal(`
    <div class="modal-head"><h3>Modifier l'abonnement</h3><button class="icon-btn" data-close>${I.x}</button></div>
    <div class="modal-body">
      <div class="field"><div class="row2">
        <div><label>Plan</label><select id="sPlan">${Object.entries(PLAN_LABEL).map(([k, v]) => `<option value="${k}" ${sub?.plan === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label>Statut</label><select id="sStatus">${[['none', 'Aucun'], ['trial', 'Essai'], ['active', 'Actif'], ['unpaid', 'Impayé'], ['expired', 'Expiré'], ['canceled', 'Annulé']].map(([k, v]) => `<option value="${k}" ${sub?.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div></div>
      <div class="field"><div class="row2">
        <div><label>Prix (€)</label><input id="sPrice" type="number" step="0.01" value="${sub?.price ?? 0}" /></div>
        <div><label>Réduction (%)</label><input id="sDisc" type="number" step="1" min="0" max="100" value="${sub?.discount_pct ?? 0}" /></div>
      </div></div>
      <div class="field"><div class="row2">
        <div><label>Payé ?</label><select id="sPaid"><option value="false" ${!sub?.paid ? 'selected' : ''}>Non payé</option><option value="true" ${sub?.paid ? 'selected' : ''}>Payé ✓</option></select></div>
        <div><label>Montant payé (€)</label><input id="sPaidAmt" type="number" step="0.01" value="${sub?.paid_amount ?? 0}" /></div>
      </div></div>
      <div class="field"><div class="row2">
        <div><label>Début</label><input id="sStart" type="date" value="${sub?.starts_at ? sub.starts_at.slice(0, 10) : ''}" /></div>
        <div><label>Expire le</label><input id="sEnd" type="date" value="${sub?.expires_at ? sub.expires_at.slice(0, 10) : ''}" /></div>
      </div></div>
      <div class="field"><div style="font-size:11.5px;color:var(--muted-2);background:#f6f8fc;border:1px dashed var(--border);border-radius:9px;padding:9px 11px">📞 Les minutes d'appel (et les autres quotas) se gèrent dans la carte <b>« Limites d'utilisation »</b> ci-dessous.</div></div>
      <div class="field"><label>Notes</label><textarea id="sNotes" rows="2">${esc(sub?.notes || '')}</textarea></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" id="sGo">Enregistrer</button></div>`);
  ov.querySelector('#sGo').addEventListener('click', async () => {
    const btn = ov.querySelector('#sGo'); btn.disabled = true;
    const payload = {
      user_id: pid,
      plan: ov.querySelector('#sPlan').value,
      status: ov.querySelector('#sStatus').value,
      price: Number(ov.querySelector('#sPrice').value || 0),
      discount_pct: Number(ov.querySelector('#sDisc').value || 0),
      paid: ov.querySelector('#sPaid').value === 'true',
      paid_amount: Number(ov.querySelector('#sPaidAmt').value || 0),
      starts_at: ov.querySelector('#sStart').value ? new Date(ov.querySelector('#sStart').value).toISOString() : null,
      expires_at: ov.querySelector('#sEnd').value ? new Date(ov.querySelector('#sEnd').value + 'T23:59:59').toISOString() : null,
      notes: ov.querySelector('#sNotes').value || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('subscriptions').upsert(payload);
    if (error) { toast('Erreur: ' + error.message, true); btn.disabled = false; return; }
    ov.remove(); toast('Abonnement mis à jour ✓'); onDone?.();
  });
}

function passwordModal(uid) {
  const ov = modal(`
    <div class="modal-head"><h3>Nouveau mot de passe</h3><button class="icon-btn" data-close>${I.x}</button></div>
    <div class="modal-body"><div class="field"><label>Mot de passe (min. 6 caractères)</label><input id="npw" type="text" placeholder="Nouveau mot de passe" /></div></div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" id="npwGo">Changer</button></div>`);
  ov.querySelector('#npwGo').addEventListener('click', async () => {
    const res = await adminOp({ action: 'set_password', user_id: uid, password: ov.querySelector('#npw').value });
    if (!res.ok) return toast(res.error || 'Erreur', true);
    ov.remove(); toast('Mot de passe changé ✓');
  });
}

function deleteUserModal(uid, label, onDone) {
  const ov = modal(`
    <div class="modal-head"><h3>Supprimer le compte</h3><button class="icon-btn" data-close>${I.x}</button></div>
    <div class="modal-body"><p style="font-size:13px;line-height:1.5;color:var(--muted)">Supprimer définitivement <b style="color:var(--text)">${esc(label)}</b> et toutes ses données ? Cette action est irréversible.</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-danger" id="delGo">Supprimer définitivement</button></div>`);
  ov.querySelector('#delGo').addEventListener('click', async () => {
    const btn = ov.querySelector('#delGo'); btn.disabled = true; btn.textContent = 'Suppression…';
    const res = await adminOp({ action: 'delete_user', user_id: uid });
    if (!res.ok) { toast(res.error || 'Erreur', true); btn.disabled = false; btn.textContent = 'Supprimer définitivement'; return; }
    ov.remove(); toast('Compte supprimé'); onDone?.();
  });
}

/* ════════════════ UTILISATEURS (admin) ════════════════
   TOUS les comptes de l'application — admins, médecins et patients —
   réunis au même endroit. Un clic ouvre la fiche complète du compte
   (fiche patient, fiche médecin ou fiche utilisateur selon le rôle). */
const ROLE_BADGE = {
  admin: '<span class="badge indigo">👑 Admin</span>',
  doctor: '<span class="badge violet">🩺 Médecin</span>',
  patient: '<span class="badge gray">👤 Patient</span>',
};
const userHref = (p) =>
  p.role === 'doctor' ? `#/doctor/${p.user_id}` : p.role === 'admin' ? `#/user/${p.user_id}` : `#/patient/${p.user_id}`;

async function pageUsers() {
  const page = shell('#/users', 'Utilisateurs', 'Tous les comptes : admins, médecins et patients', loading);
  const [profsRes, patients, usageRes] = await Promise.all([
    db.from('profiles').select('user_id, role, name, email, phone, language, created_at').order('created_at', { ascending: false }),
    fetchPatients(),
    db.from('ai_usage').select('user_id, cost_usd, created_at').order('created_at', { ascending: false }).limit(10000),
  ]);
  const profs = profsRes.data ?? [];
  const pmap = Object.fromEntries(patients.map((p) => [p.user_id, p]));
  // Coût IA + dernière requête IA par compte (les lignes arrivent du plus récent au plus ancien).
  const usage = {};
  (usageRes.data ?? []).forEach((r) => {
    const u = (usage[r.user_id] ??= { cost: 0, n: 0, last: r.created_at });
    u.cost += Number(r.cost_usd || 0);
    u.n++;
  });
  const nAdm = profs.filter((p) => p.role === 'admin').length;
  const nDoc = profs.filter((p) => p.role === 'doctor').length;
  const nPat = profs.filter((p) => p.role === 'patient').length;

  const rowHtml = (p) => {
    const ov = pmap[p.user_id];
    const u = usage[p.user_id];
    const last = ov?.last_activity || u?.last || null;
    return `<tr class="click" data-uhref="${userHref(p)}">
      <td><div class="cell-user">${avatar(p.name, p.email)}<div style="min-width:0"><div class="nm">${esc((p.role === 'doctor' ? 'Dr. ' : '') + (p.name || 'Sans nom'))}</div><div class="em">${esc(p.email || '')}</div></div></div></td>
      <td>${ROLE_BADGE[p.role] || `<span class="badge gray">${esc(p.role || '—')}</span>`}</td>
      <td style="font-size:12px;color:var(--muted)">${p.phone ? '📱 ' + esc(p.phone) : '—'}</td>
      <td>${p.language ? `<span class="badge gray">${esc(String(p.language).toUpperCase())}</span>` : '—'}</td>
      <td style="color:var(--muted);font-size:12px">${fmtDate(p.created_at)}</td>
      <td style="color:var(--muted);font-size:12px">${last ? timeAgo(last) : '—'}</td>
      <td>${p.role === 'patient' ? `<span class="badge blue">📷 ${ov?.meals_count ?? 0}</span> <span class="badge red">🩸 ${ov?.glucose_count ?? 0}</span>` : '—'}</td>
      <td>${u ? `<b style="color:var(--primary)">${fmtUsd(u.cost)}</b> <span style="font-size:11px;color:var(--muted-2)">(${u.n})</span>` : '—'}</td>
      <td style="color:var(--muted-2);width:20px">${I.chevR}</td>
    </tr>`;
  };
  const tableHtml = (rows) => rows.length
    ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Téléphone</th><th>Langue</th><th>Inscrit le</th><th>Dernière activité</th><th>Données</th><th>Conso IA</th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`
    : `<div class="empty"><div class="e">👥</div><div class="t">Aucun compte</div></div>`;

  const renderList = () => {
    const q = (document.getElementById('usearch')?.value || '').trim().toLowerCase();
    const fRole = document.getElementById('fRole')?.value || '';
    let f = profs;
    if (fRole) f = f.filter((p) => p.role === fRole);
    if (q) f = f.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (p.phone || '').toLowerCase().includes(q));
    document.getElementById('ulist').innerHTML = tableHtml(f);
    document.getElementById('ucount').textContent = `${f.length} / ${profs.length}`;
    document.querySelectorAll('#ulist tr[data-uhref]').forEach((tr) =>
      tr.addEventListener('click', () => { location.hash = tr.dataset.uhref; }));
  };

  page.innerHTML = `
    <div class="stats-grid fade-up" style="margin-bottom:16px">
      <div class="card stat-card"><div class="sc-body"><div class="l">Comptes au total</div><div class="v">${profs.length}</div></div><div class="ic tone-indigo">${I.group}</div></div>
      <div class="card stat-card"><div class="sc-body"><div class="l">Admins</div><div class="v">${nAdm}</div></div><div class="ic tone-amber" style="font-size:19px">👑</div></div>
      <div class="card stat-card"><div class="sc-body"><div class="l">Médecins</div><div class="v">${nDoc}</div></div><div class="ic tone-violet">${I.steth}</div></div>
      <div class="card stat-card"><div class="sc-body"><div class="l">Patients</div><div class="v">${nPat}</div></div><div class="ic tone-green">${I.users}</div></div>
    </div>
    <div class="page-actions fade-up">
      <div class="search-bar">${I.search}<input id="usearch" placeholder="Rechercher un compte (nom, email, téléphone)…" /></div>
      <select class="sel" id="fRole">
        <option value="">👥 Tous les rôles</option>
        <option value="admin">👑 Admins</option>
        <option value="doctor">🩺 Médecins</option>
        <option value="patient">👤 Patients</option>
      </select>
      <span class="badge gray" id="ucount"></span>
    </div>
    <div class="card fade-up" style="animation-delay:.05s" id="ulist"></div>`;
  renderList();
  document.getElementById('usearch').addEventListener('input', renderList);
  document.getElementById('fRole').addEventListener('change', renderList);
}

/* ════════════════ DOCTORS (admin) ════════════════ */
async function pageDoctors() {
  const page = shell('#/doctors', 'Médecins', 'Comptes médecins et leurs patients', loading);
  const doctors = await fetchDoctors();
  page.innerHTML = `
    <div class="page-actions fade-up">
      <div class="spacer" style="flex:1"></div>
      <button class="btn btn-primary" id="addDoc">${I.plus} Ajouter un médecin</button>
    </div>
    <div class="card fade-up">
      ${doctors.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Médecin</th><th>Patients</th><th>Codes promo</th><th>Filleuls</th><th>Créé le</th><th></th></tr></thead>
        <tbody>${doctors.map((d) => `
          <tr class="click" data-did="${d.user_id}">
            <td><div class="cell-user">${avatar(d.name, d.email)}<div style="min-width:0"><div class="nm">Dr. ${esc(d.name || 'Sans nom')}</div><div class="em">${esc(d.email || '')}</div></div></div></td>
            <td><span class="badge indigo">${d.patients_count} patient${d.patients_count > 1 ? 's' : ''}</span></td>
            <td><b>${d.codes_count}</b></td>
            <td><b>${d.referred_count}</b></td>
            <td style="color:var(--muted);font-size:12px">${fmtDate(d.created_at)}</td>
            <td style="color:var(--muted-2);width:20px">${I.chevR}</td>
          </tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><div class="e">👨‍⚕️</div><div class="t">Aucun médecin</div><div class="s">Ajoutez votre premier médecin partenaire.</div></div>`}
    </div>`;
  document.getElementById('addDoc').addEventListener('click', () => addUserModal('doctor', [], () => pageDoctors()));
  page.querySelectorAll('tr[data-did]').forEach((tr) =>
    tr.addEventListener('click', () => { location.hash = `#/doctor/${tr.dataset.did}`; }));
}

/* La fiche médecin passe désormais par la fiche compte unifiée (pagePatient). */

/* ════════════════ PROMO CODES ════════════════ */
function promoTable(codes, opts = {}) {
  if (!codes.length) return `<div class="empty"><div class="e">🎟️</div><div class="t">Aucun code promo</div><div class="s">Générez un code pour parrainer des patients (-10%).</div></div>`;
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th>Code</th>${!opts.hideDoctor ? '<th>Médecin</th>' : ''}<th>Réduction</th><th>Utilisations</th><th>Statut</th><th>Créé le</th>${me.role === 'admin' ? '<th></th>' : ''}</tr></thead>
    <tbody>${codes.map((c) => `
      <tr data-code="${c.id}">
        <td><span class="code-chip">${esc(c.code)}</span></td>
        ${!opts.hideDoctor ? `<td>${c._doctorName ? `<span class="badge violet">Dr. ${esc(c._doctorName)}</span>` : '—'}</td>` : ''}
        <td><b style="color:var(--green-text)">-${Number(c.discount_pct)}%</b></td>
        <td><b>${c.uses_count}</b>${c.max_uses ? ` / ${c.max_uses}` : ''}</td>
        <td><button class="switch ${c.active ? 'on' : ''}" data-toggle="${c.id}" title="${c.active ? 'Désactiver' : 'Activer'}"></button></td>
        <td style="color:var(--muted);font-size:12px">${fmtDate(c.created_at)}</td>
        ${me.role === 'admin' ? `<td style="width:34px"><button class="icon-btn" data-del="${c.id}" title="Supprimer">${I.trash}</button></td>` : ''}
      </tr>`).join('')}</tbody></table></div>`;
}
function bindPromoRows(scope, refresh) {
  scope.querySelectorAll('[data-toggle]').forEach((sw) =>
    sw.addEventListener('click', async () => {
      const on = !sw.classList.contains('on');
      sw.classList.toggle('on', on);
      const { error } = await db.from('promo_codes').update({ active: on }).eq('id', sw.dataset.toggle);
      if (error) { sw.classList.toggle('on', !on); return toast('Erreur: ' + error.message, true); }
      toast(on ? 'Code activé ✓' : 'Code désactivé');
    }));
  scope.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Supprimer ce code promo ?')) return;
      const { error } = await db.from('promo_codes').delete().eq('id', b.dataset.del);
      if (error) return toast('Erreur: ' + error.message, true);
      toast('Code supprimé'); refresh?.();
    }));
}

const genCode = (name) => {
  const base = (name || 'GLUCO').normalize('NFD').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 5) || 'GLUCO';
  return base + Math.floor(10 + Math.random() * 90);
};

function promoModal(doctors, forcedDoctorId, onDone) {
  const isAdmin = me.role === 'admin';
  const selfDoc = !isAdmin;
  const ov = modal(`
    <div class="modal-head"><h3>Générer un code promo</h3><button class="icon-btn" data-close>${I.x}</button></div>
    <div class="modal-body">
      ${isAdmin && !forcedDoctorId
        ? `<div class="field"><label>Médecin</label><select id="cDoc">${doctors.map((d) => `<option value="${d.user_id}">Dr. ${esc(d.name || d.email)}</option>`).join('')}</select></div>`
        : ''}
      <div class="field"><label>Code</label><input id="cCode" style="text-transform:uppercase;font-family:ui-monospace,Consolas,monospace;letter-spacing:.06em" value="${genCode(selfDoc ? me.name : doctors[0]?.name)}" /></div>
      <div class="field"><div class="row2">
        <div><label>Réduction (%)</label><input id="cDisc" type="number" min="1" max="100" value="10" /></div>
        <div><label>Utilisations max (vide = ∞)</label><input id="cMax" type="number" min="1" placeholder="∞" /></div>
      </div></div>
      <p style="font-size:11.5px;color:var(--muted-2);line-height:1.5">Le patient saisit ce code à l'inscription : il obtient la réduction sur son abonnement et est automatiquement rattaché au médecin.</p>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" id="cGo">Créer le code</button></div>`);
  const docSel = ov.querySelector('#cDoc');
  docSel?.addEventListener('change', () => {
    const d = doctors.find((x) => x.user_id === docSel.value);
    ov.querySelector('#cCode').value = genCode(d?.name);
  });
  ov.querySelector('#cGo').addEventListener('click', async () => {
    const btn = ov.querySelector('#cGo'); btn.disabled = true;
    const doctorId = forcedDoctorId || (selfDoc ? me.id : docSel?.value);
    const payload = {
      code: ov.querySelector('#cCode').value.trim().toUpperCase(),
      doctor_id: doctorId,
      discount_pct: Number(ov.querySelector('#cDisc').value || 10),
      max_uses: ov.querySelector('#cMax').value ? Number(ov.querySelector('#cMax').value) : null,
      active: true,
    };
    if (!payload.code) { toast('Code vide', true); btn.disabled = false; return; }
    const { error } = await db.from('promo_codes').insert(payload);
    if (error) { toast(error.code === '23505' ? 'Ce code existe déjà' : 'Erreur: ' + error.message, true); btn.disabled = false; return; }
    ov.remove(); toast('Code promo créé ✓'); onDone?.();
  });
}

async function pagePromos() {
  const page = shell('#/promos', 'Codes promo', 'Parrainage médecins · -10% pour les patients', loading);
  const [codesRes, doctors] = await Promise.all([
    db.from('promo_codes').select('*').order('created_at', { ascending: false }),
    me.role === 'admin' ? fetchDoctors() : Promise.resolve([]),
  ]);
  const codes = codesRes.data ?? [];
  if (me.role === 'admin') {
    const dmap = Object.fromEntries(doctors.map((d) => [d.user_id, d.name || d.email]));
    codes.forEach((c) => { c._doctorName = dmap[c.doctor_id]; });
  }
  const totalUses = codes.reduce((a, c) => a + (c.uses_count || 0), 0);

  page.innerHTML = `
    <div class="stats-grid fade-up" style="margin-bottom:16px">
      <div class="card stat-card"><div class="sc-body"><div class="l">Codes créés</div><div class="v">${codes.length}</div></div><div class="ic tone-amber">${I.tag}</div></div>
      <div class="card stat-card"><div class="sc-body"><div class="l">Patients parrainés</div><div class="v">${totalUses}</div></div><div class="ic tone-green">${I.users}</div></div>
      <div class="card stat-card"><div class="sc-body"><div class="l">Codes actifs</div><div class="v">${codes.filter((c) => c.active).length}</div></div><div class="ic tone-indigo">${I.check}</div></div>
    </div>
    <div class="page-actions fade-up">
      <div class="spacer" style="flex:1"></div>
      <button class="btn btn-primary" id="addCode" ${me.role === 'admin' && !doctors.length ? 'disabled title="Ajoutez d\'abord un médecin"' : ''}>${I.plus} Générer un code</button>
    </div>
    <div class="card fade-up" id="codesCard">${promoTable(codes)}</div>`;
  document.getElementById('addCode').addEventListener('click', () => promoModal(me.role === 'admin' ? doctors : [], null, () => pagePromos()));
  bindPromoRows(page, () => pagePromos());
}

/* ════════════════ SUBSCRIPTIONS (admin) ════════════════ */
async function pageSubs() {
  const page = shell('#/subs', 'Abonnements', 'Paiements et échéances des patients', loading);
  const [patients, allPays] = await Promise.all([
    fetchPatients(),
    db.from('payments').select('user_id, period, amount').then((r) => r.data ?? []),
  ]);
  const paysByUser = {};
  allPays.forEach((p) => { (paysByUser[p.user_id] ??= new Set()).add(String(p.period).slice(0, 7)); });
  const unpaidCount = (p) => {
    const due = monthsDue(p); // patient_overview carries starts_at/expires_at/status
    if (!due.length) return null;
    const paid = paysByUser[p.user_id] ?? new Set();
    return due.filter((k) => !paid.has(k)).length;
  };

  const withSub = patients.filter((p) => p.status && p.status !== 'none');
  const active = withSub.filter((p) => statusOf(p) === 'active');
  const unpaid = withSub.filter((p) => (unpaidCount(p) ?? 0) > 0 || p.paid === false);
  const expSoon = withSub.filter((p) => { const d = daysLeft(p.expires_at); return d !== null && d >= 0 && d <= 7; });
  const revenue = allPays.reduce((a, p) => a + Number(p.amount || 0), 0)
    || withSub.reduce((a, p) => a + Number(p.paid_amount || 0), 0);

  const rowsHtml = (list) => list.map((p) => {
    const dl = daysLeft(p.expires_at);
    const eff = Math.max(0, Number(p.price || 0) * (1 - Number(p.discount_pct || 0) / 100));
    const nUnpaid = unpaidCount(p);
    // WhatsApp renewal reminder — only when we can reach them AND it matters
    const needsReminder = p.phone && ((dl !== null && dl <= 7) || (nUnpaid ?? 0) > 0);
    const waMsg = dl !== null && dl < 0
      ? `Bonjour ${p.name || ''} 👋, votre abonnement GluciAI a expiré le ${fmtDate(p.expires_at)}. Pensez à le renouveler pour continuer à profiter de toutes les fonctionnalités 😊`
      : dl !== null && dl <= 7
        ? `Bonjour ${p.name || ''} 👋, votre abonnement GluciAI expire le ${fmtDate(p.expires_at)} (dans ${dl} jour${dl > 1 ? 's' : ''}). Pensez à le renouveler 😊`
        : `Bonjour ${p.name || ''} 👋, il reste ${nUnpaid} mois impayé${(nUnpaid ?? 0) > 1 ? 's' : ''} sur votre abonnement GluciAI. Merci de régulariser quand vous pouvez 😊`;
    return `<tr class="click" data-sub="${p.user_id}">
      <td><div class="cell-user">${avatar(p.name, p.email)}<div style="min-width:0"><div class="nm">${esc(p.name || 'Sans nom')}</div><div class="em">${esc(p.phone || p.email || '')}</div></div></div></td>
      <td>${p.plan ? PLAN_LABEL[p.plan] || esc(p.plan) : '—'}</td>
      <td>${subBadge(p)}</td>
      <td>${p.price ? `<b>${eff.toFixed(2)} €</b>${p.discount_pct ? ` <span style="color:var(--green-text);font-size:11px">-${p.discount_pct}%</span>` : ''}` : '—'}</td>
      <td>${nUnpaid === null ? '—' : nUnpaid > 0 ? `<span class="badge red">${nUnpaid} mois impayé${nUnpaid > 1 ? 's' : ''}</span>` : '<span class="badge green">À jour ✓</span>'}</td>
      <td style="font-size:12px;color:var(--muted)">${p.expires_at ? `${fmtDate(p.expires_at)}${dl !== null ? ` <span style="color:${dl < 0 ? 'var(--red-text)' : dl <= 7 ? 'var(--amber-text)' : 'var(--muted-2)'}">(${dl < 0 ? 'expiré' : dl + ' j'})</span>` : ''}` : '—'}</td>
      <td style="width:52px">${needsReminder
        ? `<a class="btn btn-ghost" data-stop="1" style="height:32px;padding:0 10px;font-size:12px;text-decoration:none" target="_blank" rel="noopener" title="Rappel WhatsApp" href="${waHref(p.phone, p.language, waMsg)}">💬</a>`
        : ''}</td>
      <td style="color:var(--muted-2);width:20px">${I.chevR}</td>
    </tr>`;
  }).join('');

  const renderTable = () => {
    const q = (document.getElementById('ssearch')?.value || '').trim().toLowerCase();
    const fStat = document.getElementById('sfStat')?.value || '';
    const fPay = document.getElementById('sfPay')?.value || '';
    let f = patients;
    if (q) f = f.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q));
    if (fStat) f = f.filter((p) => statusOf(p) === fStat);
    if (fPay === 'late') f = f.filter((p) => (unpaidCount(p) ?? 0) > 0);
    if (fPay === 'ok') f = f.filter((p) => unpaidCount(p) === 0);
    document.getElementById('subsBody').innerHTML = rowsHtml(f)
      || `<tr><td colspan="8"><div class="empty"><div class="e">🔍</div><div class="t">Aucun résultat</div></div></td></tr>`;
    bindSubRows();
  };
  const bindSubRows = () => {
    page.querySelectorAll('tr[data-sub]').forEach((tr) =>
      tr.addEventListener('click', async (e) => {
        if (e.target.closest('[data-stop]')) return; // WhatsApp link, not the row
        const pid = tr.dataset.sub;
        const { data: sub } = await db.from('subscriptions').select('*').eq('user_id', pid).maybeSingle();
        subModal(pid, sub, () => pageSubs());
      }));
  };

  page.innerHTML = `
    <div class="stats-grid fade-up" style="margin-bottom:16px">
      <div class="card stat-card"><div class="sc-body"><div class="l">Abonnés actifs</div><div class="v">${active.length}</div></div><div class="ic tone-green">${I.card}</div></div>
      <div class="card stat-card"><div class="sc-body"><div class="l">En retard de paiement</div><div class="v">${unpaid.length}</div></div><div class="ic tone-red">${I.card}</div></div>
      <div class="card stat-card"><div class="sc-body"><div class="l">Expirent sous 7 j</div><div class="v">${expSoon.length}</div></div><div class="ic tone-amber">${I.card}</div></div>
      <div class="card stat-card"><div class="sc-body"><div class="l">Total encaissé</div><div class="v">${revenue.toFixed(0)} €</div></div><div class="ic tone-indigo">${I.card}</div></div>
    </div>
    <div class="page-actions fade-up">
      <div class="search-bar">${I.search}<input id="ssearch" placeholder="Rechercher un patient…" /></div>
      <select class="sel" id="sfStat">
        <option value="">💳 Tous les statuts</option>
        <option value="active">Actif</option>
        <option value="trial">Essai</option>
        <option value="unpaid">Impayé</option>
        <option value="expired">Expiré</option>
        <option value="canceled">Annulé</option>
        <option value="none">Aucun</option>
      </select>
      <select class="sel" id="sfPay">
        <option value="">💰 Tous les paiements</option>
        <option value="late">En retard</option>
        <option value="ok">À jour</option>
      </select>
    </div>
    <div class="card fade-up">
      <div class="card-head"><h3>Tous les patients</h3><span class="hint">cliquez pour modifier l'abonnement · les mois se gèrent depuis la fiche patient</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Patient</th><th>Plan</th><th>Statut</th><th>Prix</th><th>Paiements</th><th>Expire</th><th>Rappel</th><th></th></tr></thead>
        <tbody id="subsBody">${rowsHtml(patients)}</tbody></table></div>
    </div>`;
  bindSubRows();
  document.getElementById('ssearch').addEventListener('input', renderTable);
  document.getElementById('sfStat').addEventListener('change', renderTable);
  document.getElementById('sfPay').addEventListener('change', renderTable);
}

/* ════════════════ AI USAGE / COSTS ════════════════ */
const fmtUsd = (v) => (v >= 0.01 ? `$${v.toFixed(3)}` : v > 0 ? `$${v.toFixed(6)}` : '$0');
const fmtTok = (n) => Number(n || 0).toLocaleString('fr-FR');
const KIND_META = {
  chat: { label: 'Chat IA', icon: '💬' },
  scan: { label: 'Scanner repas', icon: '📷' },
  call: { label: 'Appel vocal (Live)', icon: '📞' },
  voice: { label: 'Voix (secours)', icon: '🎙️' },
  bolus: { label: 'Calcul insuline', icon: '💉' },
  lab: { label: 'Analyse labo', icon: '🧪' },
  tts: { label: 'Lecture vocale', icon: '🔊' },
};

async function pageUsage() {
  const page = shell('#/usage', 'Consommation IA', 'Tokens Gemini et coût exact par utilisateur', loading);

  const render = async () => {
    const period = document.getElementById('uPeriod')?.value ?? 'month';
    let q = db.from('ai_usage').select('*').order('created_at', { ascending: false }).limit(5000);
    const now = new Date();
    if (period === 'month') q = q.gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
    else if (period === '7d') q = q.gte('created_at', new Date(Date.now() - 7 * 86400e3).toISOString());
    else if (period === '30d') q = q.gte('created_at', new Date(Date.now() - 30 * 86400e3).toISOString());

    const [{ data: rowsRaw }, profRes] = await Promise.all([
      q,
      me.role === 'admin'
        ? db.from('profiles').select('user_id, name, email, role')
        : db.from('patient_overview').select('user_id, name, email'),
    ]);
    const rows = rowsRaw ?? [];
    const profs = {};
    (profRes.data ?? []).forEach((p) => { profs[p.user_id] = { name: p.name, email: p.email, role: p.role || 'patient' }; });
    profs[me.id] = { name: me.name, email: me.email, role: me.role };

    const totalCost = rows.reduce((a, r) => a + Number(r.cost_usd || 0), 0);
    const totIn = rows.reduce((a, r) => a + (r.input_tokens || 0) + (r.audio_input_tokens || 0), 0);
    const totOut = rows.reduce((a, r) => a + (r.output_tokens || 0) + (r.audio_output_tokens || 0), 0);

    // by kind
    const byKind = {};
    rows.forEach((r) => {
      const k = (byKind[r.kind] ??= { n: 0, in: 0, out: 0, cost: 0 });
      k.n++; k.in += (r.input_tokens || 0) + (r.audio_input_tokens || 0);
      k.out += (r.output_tokens || 0) + (r.audio_output_tokens || 0);
      k.cost += Number(r.cost_usd || 0);
    });

    // by user
    const byUser = {};
    rows.forEach((r) => {
      const u = (byUser[r.user_id] ??= { n: 0, in: 0, out: 0, cost: 0 });
      u.n++; u.in += (r.input_tokens || 0) + (r.audio_input_tokens || 0);
      u.out += (r.output_tokens || 0) + (r.audio_output_tokens || 0);
      u.cost += Number(r.cost_usd || 0);
    });
    const users = Object.entries(byUser).sort((a, b) => b[1].cost - a[1].cost);

    document.getElementById('usageBody').innerHTML = `
      <div class="stats-grid fade-up" style="margin-bottom:16px">
        <div class="card stat-card"><div class="sc-body"><div class="l">Coût total (USD)</div><div class="v">${fmtUsd(totalCost)}</div></div><div class="ic tone-indigo">${I.cpu}</div></div>
        <div class="card stat-card"><div class="sc-body"><div class="l">Requêtes IA</div><div class="v">${rows.length}</div></div><div class="ic tone-blue">${I.pulse}</div></div>
        <div class="card stat-card"><div class="sc-body"><div class="l">Tokens entrée</div><div class="v">${fmtTok(totIn)}</div></div><div class="ic tone-green">${I.cpu}</div></div>
        <div class="card stat-card"><div class="sc-body"><div class="l">Tokens sortie</div><div class="v">${fmtTok(totOut)}</div></div><div class="ic tone-violet">${I.cpu}</div></div>
      </div>

      <div class="card fade-up" style="margin-bottom:16px">
        <div class="card-head"><h3>Par fonctionnalité</h3></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Fonction</th><th>Requêtes</th><th>Tokens entrée</th><th>Tokens sortie</th><th>Coût (USD)</th></tr></thead>
          <tbody>${Object.entries(byKind).length ? Object.entries(byKind).map(([k, v]) => `
            <tr><td><b>${KIND_META[k]?.icon ?? '🤖'} ${KIND_META[k]?.label ?? esc(k)}</b></td>
            <td>${v.n}</td><td>${fmtTok(v.in)}</td><td>${fmtTok(v.out)}</td>
            <td><b style="color:var(--primary)">${fmtUsd(v.cost)}</b></td></tr>`).join('')
          : `<tr><td colspan="5"><div class="empty"><div class="e">🧮</div><div class="t">Aucune utilisation sur cette période</div></div></td></tr>`}</tbody>
        </table></div>
      </div>

      <div class="card fade-up">
        <div class="card-head"><h3>Par utilisateur</h3><span class="hint">trié par coût</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Requêtes</th><th>Tokens entrée</th><th>Tokens sortie</th><th>Coût (USD)</th></tr></thead>
          <tbody>${users.length ? users.map(([uid, v]) => {
            const p = profs[uid] ?? {};
            const roleBadge = p.role === 'admin' ? '<span class="badge indigo">Admin</span>'
              : p.role === 'doctor' ? '<span class="badge violet">Médecin</span>'
              : '<span class="badge gray">Patient</span>';
            return `<tr>
              <td><div class="cell-user">${avatar(p.name, p.email)}<div style="min-width:0"><div class="nm">${esc(p.name || 'Sans nom')}</div><div class="em">${esc(p.email || uid.slice(0, 8) + '…')}</div></div></div></td>
              <td>${roleBadge}</td><td><b>${v.n}</b></td>
              <td>${fmtTok(v.in)}</td><td>${fmtTok(v.out)}</td>
              <td><b style="color:var(--primary)">${fmtUsd(v.cost)}</b></td>
            </tr>`;
          }).join('') : `<tr><td colspan="6"><div class="empty"><div class="e">🧮</div><div class="t">Aucune utilisation sur cette période</div></div></td></tr>`}</tbody>
        </table></div>
      </div>

      <p class="fade-up" style="font-size:11px;color:var(--muted-2);margin-top:14px;line-height:1.6">
        Chiffres <b>exacts</b> renvoyés par l'API Gemini (usageMetadata) à chaque requête, valorisés aux tarifs officiels Google :
        gemini-2.5-flash $0.30 entrée / $2.50 sortie · gemini-3.1-flash-live-preview $0.75 texte / $3.00 audio entrée, $4.50 texte / $12.00 audio sortie (par million de tokens).
        Suivi actif depuis le 11 juillet 2026 — l'utilisation antérieure n'est pas comptée.
      </p>`;
  };

  const defCard = me.role === 'admin' ? await defaultLimitsCardHTML() : '';
  page.innerHTML = `
    ${defCard}
    <div class="page-actions fade-up">
      <select class="sel" id="uPeriod">
        <option value="month">📅 Ce mois-ci</option>
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="all">Depuis le début</option>
      </select>
    </div>
    <div id="usageBody">${loading}</div>`;
  document.getElementById('uPeriod').addEventListener('change', render);
  if (me.role === 'admin') bindDefaultLimits();
  await render();
}

/* ── go ── */
boot();
