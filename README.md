# GluciAI 🩺

Application premium de gestion du diabète avec IA — scanner de repas, suivi glycémie/insuline, coach IA, analytics.
Design inspiré de Bevel : dark mode, glassmorphism, vert menthe + bleu électrique.

**Une seule base de code** (Expo / React Native) qui tourne sur :
- 🌐 **Web** (test sur Vercel)
- 🍎 **iOS** (App Store, via EAS Build)
- 🤖 **Android** (Google Play, via EAS Build)

**4 langues** : العربية (RTL) · Français · Deutsch · English

---

## 🚀 Démarrage rapide (local)

```bash
cd glucoai
npm install
npm run web        # ouvre l'app dans le navigateur
```

> **Mode démo** : sans configuration Supabase, l'app fonctionne avec des données
> locales et des réponses IA de démonstration. Parfait pour tester l'UI.

## 1️⃣ Configurer Supabase (base de données + auth + IA)

1. Crée un projet sur [supabase.com](https://supabase.com) (gratuit).
2. Dans **SQL Editor**, colle et exécute le contenu de
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   → crée les tables, la sécurité RLS et les buckets de stockage.
3. Dans **Project Settings → API**, copie l'URL et la clé `anon`.
4. Crée un fichier `.env` (copie de `.env.example`) :

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### Activer l'IA (scanner + chat)

Les clés IA restent **côté serveur** (Edge Functions) — jamais dans l'app.

```bash
npm install -g supabase
supabase login
supabase link --project-ref <ton-project-ref>
supabase secrets set OPENAI_API_KEY=sk-...
supabase functions deploy analyze-meal
supabase functions deploy ai-chat
```

## 2️⃣ Déployer sur Vercel (test web)

```bash
npm install -g vercel
vercel          # depuis le dossier glucoai/
```

Ou via GitHub : importe le repo sur [vercel.com](https://vercel.com) —
le `vercel.json` configure déjà le build (`expo export`) et le dossier `dist`.

⚠️ Ajoute les variables `EXPO_PUBLIC_SUPABASE_URL` et
`EXPO_PUBLIC_SUPABASE_ANON_KEY` dans **Vercel → Settings → Environment Variables**.

## 3️⃣ Publier sur App Store & Google Play (EAS)

```bash
npm install -g eas-cli
eas login                        # compte expo.dev gratuit
eas build:configure
eas build --platform android     # .aab pour Google Play
eas build --platform ios         # nécessite un compte Apple Developer (99$/an)
eas submit --platform android
eas submit --platform ios
```

Identifiants déjà configurés dans `app.json` :
`com.nabil.glucoai` (Android + iOS).

---

## 📁 Structure

```
src/
  app/            # écrans (expo-router)
    (tabs)/       # Accueil, Historique, Chat IA, Profil
    scan.tsx      # scanner caméra (upload sur web)
    scan-result.tsx
    wizard.tsx    # onboarding médical (9 étapes)
  components/ui/  # GlassCard, AppButton, ProgressRing, FloatingTabBar…
  theme/          # design tokens (couleurs Bevel, spacing, typo)
  i18n/           # ar / fr / de / en + RTL
  services/       # ai.ts (scanner+chat), data.ts (sauvegarde)
  store/          # Zustand (persisté)
supabase/
  migrations/     # schéma SQL + RLS
  functions/      # Edge Functions IA (analyze-meal, ai-chat)
```

## ⚕️ Sécurité médicale

Toutes les estimations d'insuline sont **informatives uniquement** et
accompagnées d'un avertissement. L'app ne remplace jamais un avis médical.
