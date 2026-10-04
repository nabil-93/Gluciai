# GluciAI — Audit complet avant App Store & Google Play

**Date :** 2026-10-04 · **Commit audité :** `60d7f35` (main, arbre propre) · **Projet Supabase :** `ftqyzpkzqeudzfztataz` (live)
**Point de vue :** reviewer Apple / Google Play + auditeur sécurité + revue clinique.

---

## 0. Verdict

**Si l'app est soumise aujourd'hui, elle sera rejetée sur les deux stores.** Pas à cause de crashs —
le code compile, les tests passent — mais à cause de **règles des stores** et de **sécurité clinique** :

| Store | Motifs de rejet quasi certains |
|---|---|
| **Apple** | 1.4.1 (calculateur de dose d'insuline), 3.1.1 (déblocage payant via WhatsApp), 2.1 (fonctions verrouillées / « Bientôt » / appel IA qui ne marche pas sur iPhone), 5.1.1 (pas de politique de confidentialité accessible), 5.1.2 (données de santé envoyées à une IA tierce non nommée) |
| **Google Play** | Politique Paiements (abonnement hors Google Play Billing), formulaire « Health apps » + fonctions dispositif médical, suppression de compte **par lien web** absente, Data safety à remplir |

La bonne nouvelle : la base technique est solide (TypeScript strict, 1535 tests, moteur bolus testé,
RLS partout, suppression de compte qui marche). Tout ce qui suit est **réparable**.

---

## 1. Ce qui a été vérifié

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` | ✅ 0 erreur |
| `vitest run` | ✅ 62 fichiers · **1535 / 1535** |
| `expo lint` | ⚠️ 4 erreurs + 2 warnings (= baseline, `lint-ratchet` OK) |
| `check:edge` | ✅ |
| `expo export -p android -p ios` | ✅ bundles Hermes 11 MB chacun |
| `expo-doctor` | ❌ **2 checks échoués** (voir K-01, K-02) |
| `npm audit --omit=dev` | ⚠️ 40 vulnérabilités (27 high) — toutes dans la chaîne d'outillage (metro, @expo/cli, node-forge…), pas dans le runtime ; corrigées en grande partie par la mise à jour du SDK |
| Supabase advisors (sécurité + perf) | ❌ 1 problème réel grave (S-01) + avertissements |
| RLS de toutes les tables (live) | lues une par une |
| Buckets storage (live) | lus |
| Edge functions (12, live) | toutes lues, gardes d'auth vérifiées |
| Écrans / services / store / i18n | lus (logique complète des écrans critiques, recherche par motifs sur le reste) |
| Icône / permissions natives / app.json / eas.json | vérifiés |

---

## 2. Problèmes trouvés

Légende : 🔴 bloquant store ou danger patient · 🟠 grave · 🟡 moyen · ⚪ mineur

### 2.A — 🔴 BLOQUANTS STORES (rejet garanti)

| ID | Problème | Où | Pourquoi c'est rejeté | Correction |
|---|---|---|---|---|
| **B-01** | **Calculateur de dose d'insuline** (bolus) + rapport IA qui « recommande » la dose | `app/bolus.tsx`, `services/bolusEngine.ts`, `ai-chat` modes `bolus`/`bolus_check` | Apple 1.4.1 : *les calculateurs de dose de médicament doivent venir du fabricant, d'un hôpital, d'une université, d'une pharmacie… ou être approuvés par la FDA / équivalent*. En Europe c'est un dispositif médical classe IIb (MDR). Google demande la déclaration « Health apps » et peut exiger une preuve réglementaire. | **Décision D-2** (§3) : retirer le calcul de dose de la version store (garder le journal d'insuline + l'éducation), OU obtenir une clearance / publier sous le compte d'un établissement. |
| **B-02** | **Le chat IA calcule des doses d'insuline** (le prompt le lui demande explicitement : « A dose calculation needs: ratio, carbs, glucose… factor IOB, sport ») | `supabase/functions/ai-chat/index.ts:1305-1331` | Même règle 1.4.1, pire : un LLM qui calcule une dose. | Interdire tout calcul de dose dans le prompt (éducation générale seulement), et filtrer côté client. |
| **B-03** | **Fonctions payantes débloquées via WhatsApp** : comptes neufs verrouillés (scanner, chat IA, appel IA), écran « Mon abonnement » → message WhatsApp → l'admin débloque ; dashboard admin gère des « mois impayés » | `supabase/migrations/0013_lock_new_accounts.sql`, `app/subscription.tsx`, `components/PlanWelcome.tsx`, `components/ui/LockedFeature.tsx`, `app/usage-limits.tsx`, `components/AppAlert.tsx` | Apple 3.1.1 / 3.1.3 : tout déblocage de fonctionnalité doit passer par l'In-App Purchase ; interdit de renvoyer vers un autre moyen de paiement. Google : politique Paiements (Play Billing obligatoire). | **Décision D-1** : app gratuite (supprimer verrous + écran abonnement en build store, garder les quotas) OU IAP (RevenueCat / StoreKit + Play Billing). |
| **B-04** | **Reviewer bloqué** : un compte neuf a scanner + chat + appel verrouillés → le reviewer ne peut rien tester | même cause que B-03 | Apple 2.1 (app incomplète / non testable) | Fournir un **compte démo** tout débloqué dans App Store Connect + régler B-03. |
| **B-05** | **Aucune politique de confidentialité ni CGU accessibles** (seulement un résumé dans le consentement) | `app/profile.tsx`, `app/consent-detail.tsx` | Apple 5.1.1(i) + Google : URL de politique de confidentialité obligatoire **dans la fiche ET dans l'app**. | Héberger Privacy Policy + Terms (FR/AR/DE/EN), ajouter 2 lignes dans Profil + lien dans l'écran consentement. |
| **B-06** | **Intégrations « Bientôt »** : Apple Health, Google Fit, FreeStyle Libre, Dexcom sont des stubs affichant « Bientôt », accessibles depuis Biologie → Capteurs | `app/integrations.tsx`, `services/health/index.ts`, `app/(tabs)/biology.tsx:157` | Apple 2.1 (contenu placeholder), mention de Apple Health sans HealthKit, marques tierces. | Retirer l'entrée (et l'écran) du build store tant que non implémenté. |
| **B-07** | **Appel vocal IA ne marche pas sur iPhone/Android** : écran « L'appel vocal n'est pas disponible sur cet appareil » ; pourtant visible (Journal IA, Labs) et **vendu** comme fonction premium | `app/ai-call.tsx:1235`, `app/ai-journal.tsx:197`, `app/labs.tsx:652`, `app/subscription.tsx` | Apple 2.1 / 2.3.1 : fonction annoncée qui ne fonctionne pas. | **Décision D-3** : implémenter en natif (expo-audio + WebSocket Gemini Live) OU cacher toutes les entrées sur natif et le retirer de l'offre. |
| **B-08** | **Données de santé envoyées à une IA tierce sans la nommer** : chaque message chat/bolus/coach envoie profil + nom + glycémies + insuline + repas + analyses labo à Google Gemini ; le consentement dit seulement « l'assistant IA » | `services/ai.ts:460-696`, `consent.ai*` (i18n) | Apple 5.1.1 / 5.1.2 (règle 2025 : divulguer clairement et obtenir la permission avant partage avec une IA tierce), RGPD. | Nommer Google (Gemini) dans le consentement + la politique, minimiser (pas le prénom), consentement IA séparable. |
| **B-09** | **Promesse fausse « tes données ne servent jamais à entraîner des modèles »** | `consent.aiS3B` | Vrai seulement avec l'API Gemini **payante** ; en gratuit Google peut utiliser les contenus. Déclaration trompeuse = rejet + risque légal. | Vérifier que la clé Gemini est sur un projet **avec facturation** ; sinon corriger le texte. |
| **B-10** | **Google Play : suppression de compte par lien web absente** (seulement dans l'app) | — | Google exige une URL web où l'utilisateur peut demander la suppression sans l'app. | Page web simple (formulaire ou procédure) + l'indiquer dans la Data safety. |
| **B-11** | **Pas de « Mot de passe oublié »** (clé i18n existe, aucun `resetPasswordForEmail`) | `app/auth.tsx` | Un utilisateur qui oublie son mot de passe perd son compte et ses données médicales ; reviewer le remarque. | Écran reset password + deep link `glucoai://` pour le lien e-mail. |

### 2.B — 🔴 SÉCURITÉ CLINIQUE (danger pour le patient)

| ID | Problème | Où | Risque | Correction |
|---|---|---|---|---|
| **C-01** | **« Objectifs » d'insuline codés en dur pour tout le monde** : Accueil = 40 U/jour, page Insuline = 30 U/jour, avec anneau % et zones « Dose basse — en dessous de l'objectif du jour » | `app/(tabs)/index.tsx:87-88`, `app/insulin.tsx:44` | Un patient qui prend 20 U prescrites voit « dose basse » en bleu → pousse à surdoser → hypoglycémie. Deux valeurs contradictoires. | Supprimer la notion d'« objectif d'insuline ». Afficher le total sans jugement. |
| **C-02** | **Objectifs nutrition codés en dur** : 2000 kcal / **250 g de glucides** / jour pour tous, anneau « objectif atteint » ; le coach IA est obligé d'« atteindre » ces 250 g | `app/nutrition.tsx:51`, `(tabs)/index.tsx:87`, prompt `healthy_coach` (`ai-chat:835-845`) | Encourage un diabétique à manger 250 g de glucides ; incohérent pour un enfant, une grossesse, un DT2 en perte de poids. | Objectifs depuis le profil (ou le médecin), sinon pas d'objectif ; retirer l'obligation « atteindre le reste » du prompt. |
| **C-03** | **Paramètres cliniques pré-remplis à l'inscription** : ratio 1 U/10 g ×3, sensibilité 50, cibles 70-180 — on peut tout valider sans rien changer | `app/wizard.tsx:396-406` | Le calculateur et l'IA utilisent ensuite ces chiffres comme « prescrits par ton médecin ». | Champs vides obligatoires (ou « je ne sais pas » → pas de calcul). |
| **C-04** | **Glycémie en g/L (standard au Maroc/France) mal interprétée** : taper 1,20 → « ressemble à des mmol/L, ce serait ≈ 22 mg/dL » ; le logger IA convertit « sokar 1.5 » en ×18 = 27 mg/dL | `app/log-glucose.tsx`, `app/bolus.tsx`, `services/bolusEngine.ts:137`, prompt logger `ai-chat:435` | Le patient retape 22 → hypo fictive enregistrée ; IA enregistre 27 mg/dL au lieu de 150. | Détecter < 5 → proposer g/L (×100) ; ou préférence d'unité (mg/dL / g/L / mmol/L) dans le profil. |
| **C-05** | **Glycémie périmée utilisée pour la correction** : le bolus pré-remplit la **première glycémie du jour** (peut dater de 10 h) | `app/bolus.tsx:99,156` | Correction calculée sur une valeur ancienne. | N'utiliser qu'une mesure < 15-30 min, sinon champ vide + avertissement (si D-2 garde le bolus). |
| **C-06** | **Dose calculable sans glycémie** (glucides seuls) | `app/bolus.tsx:810` | Aucun garde-fou hypo. | Exiger une glycémie récente (si bolus conservé). |
| **C-07** | **Profil rejeté par le serveur mais utilisé quand même** : `saveProfile` écrit localement AVANT l'upsert et ne revient pas en arrière si le serveur refuse | `services/data.ts:404-413` | Le calcul utilise des ratios refusés / invalides jusqu'à la prochaine synchro. | Restaurer `before` si `error`. |
| **C-08** | **Confusion d'unités dans Profil → Médical** : ancien « ratio glucidique » (g/U) affiché à côté des ratios par repas (U/10 g) | `app/profile-edit.tsx:353-393` | Taper « 1 » (pensé U/10 g) dans le champ g/U → 60 U pour 60 g (plafonné à 20). | Masquer `carb_ratio` (legacy) ou le convertir ; valider toutes les plages (ISF, cibles, ratio). |
| **C-09** | **Numéro d'urgence choisi selon la LANGUE, pas le pays** : FR→15, AR→141, DE→112, EN→911 | `app/emergency.tsx:26-31` | Utilisateur francophone en Belgique/Canada, arabophone hors Maroc → mauvais numéro. | Pays de l'appareil (`expo-localization` regionCode) + 112 en secours + choix dans le profil. |
| **C-10** | **Rappels IA (« rappelle-moi dans 1 h de prendre mon insuline ») ne sonnent que si l'app est ouverte** : timer JS de 60 s, aucune notification système sur iPhone/Android ; l'IA promet pourtant « l'app va vous alerter » | `services/reminders.ts`, prompt logger `ai-chat:473-479` | Insuline oubliée. Apple 2.1 (fonction qui ne marche pas). | `Notifications.scheduleNotificationAsync` avec déclencheur date. |
| **C-11** | **Saisie d'insuline sans limite haute** : « 250 » (au lieu de 25,0) est enregistré | `app/log-insulin.tsx:74-82`, aucune contrainte DB sur `insulin_logs.dose` | IOB énorme → calculs faux pendant 4 h. | Confirmation au-delà de ~50 U, maximum dur, contrainte CHECK. |
| **C-12** | **« Mon Programme » (déficit calorique) sans blocage grossesse / diabète gestationnel / mineurs / insulinés** | `app/program-setup.tsx`, `services/programEngine.ts` | Plan de perte de poids proposé à une femme enceinte ou un enfant. | Bloquer pour `gestational`, < 18 ans ; avertissement hypo + validation médicale pour insulinés. (Fonction « en test » → la cacher en v1 est le plus simple.) |
| **C-13** | **Labs : l'IA se présente comme « docteur IA »** (« Explication du docteur IA », prompt « You are a warm senior doctor ») | i18n `labs.*`, `supabase/functions/lab-analyze` | Usurpation de rôle médical + interprétation d'analyses (1.4.1). | Fonction cachée par défaut : la laisser OFF en v1, ou renommer « Assistant IA » + reformuler. |
| **C-14** | Premiers secours hypo en ar/de/en **non validés** par un clinicien (TODO dans le code) ; conseils médicaux de « insight-detail » en **français seulement** | `app/emergency.tsx:151`, `app/insight-detail.tsx` | Instructions d'urgence potentiellement mal traduites. | Relecture clinicien / natif. |
| **C-15** | Décisions cliniques encore ouvertes dans vos docs (IOB soustrait aussi du bolus repas, DIA fixe 4 h pour toutes les insulines, prémix exclu de l'IOB, plafond 20 U, activité qui réduit aussi l'IOB) | `bolusEngine.ts` ; `docs/CLINICIAN-DECISION-PACK.md` | À trancher par un diabétologue **si** le bolus reste (D-2). | — |

### 2.C — 🟠 SÉCURITÉ / BACKEND

| ID | Problème | Où | Correction |
|---|---|---|---|
| **S-01** | **Empoisonnement du catalogue code-barres SANS connexion** : `upsert_product` (SECURITY DEFINER) est exécutable par `anon` ; l'appelant choisit `p_source`. Une nouvelle ligne déclarée `openfoodfacts` est considérée **fiable pour la dose** par l'app (`isCatalogRowTrusted`). N'importe qui sur Internet peut injecter de faux glucides pour un code-barres. | DB live ; `providers/productCatalog.ts:52-58` | `revoke execute … from anon`; forcer `source='user'` pour tout appelant non service-role ; ne faire confiance qu'aux lignes `verified`. |
| **S-02** | Buckets **`meal-images` et `profile-images` publics**, sans limite de taille ni type MIME → photos de repas lisibles par URL, hébergement de fichiers arbitraires possible | storage live, `services/data.ts:190-198` | Buckets privés + URLs signées (le dashboard médecin aussi) ; `file_size_limit` + `allowed_mime_types`. |
| **S-03** | **Quotas contournables** : scanner = nombre de repas **sauvegardés** (scanner sans sauvegarder = gratuit, supprimer = remise à zéro) ; chat = lignes `chat_history` insérées **par le client** (et supprimables par le patient) ; appel = durée écrite par le client | `migrations/0020_usage_limits.sql`, RLS `chat_history`/`meal_scans` | Compter côté serveur (table `ai_usage` écrite par les edge functions). |
| **S-04** | **Appels IA illimités** pour tout compte : modes `bolus`, `bolus_check`, `program_plan`, `meal_edit`, `logger`, `healthy_coach`, `app_help`, `tts`, `live-token`, `world-recipes` sans quota ; inscription sans vérification e-mail ni captcha | edge functions | Rate-limit par utilisateur, quota global, captcha/Turnstile à l'inscription. |
| **S-05** | **Pas de vérification d'e-mail** (0 compte non confirmé sur 17) → on peut créer un compte avec l'e-mail de quelqu'un d'autre | config Auth Supabase | Activer « Confirm email » (+ gérer le cas sans session dans le wizard, voir F-02). |
| **S-06** | Le médecin lié peut lire `chat_history`, `lab_reports`, notes, programmes, `ai_usage`, paiements… alors que le consentement « code médecin » ne cite que repas / glycémie / insuline / rapport | RLS `doctor patients select` | Aligner le texte du consentement OU restreindre les policies. |
| **S-07** | `ai_usage` : le patient peut **insérer** ses propres lignes (fausse facturation) | RLS `own insert` | Retirer la policy (seules les fonctions écrivent). |
| **S-08** | Fuite de détails internes : `detail` du fournisseur, texte brut du modèle, `String(error)` renvoyés au client | ai-chat, analyze-meal, tts, lab-analyze | Logger côté serveur, renvoyer un code générique. |
| **S-09** | Session + tout le dossier médical en **AsyncStorage non chiffré** | `lib/supabase.ts`, `store/useAppStore.ts` | Session dans SecureStore (adaptateur), au minimum documenter. |
| **S-10** | Protection mots de passe compromis (HIBP) désactivée | Auth | Nécessite plan Pro. |
| **S-11** | Mode démo automatique si les variables d'env manquent → un build store mal configuré tourne en démo sans rien dire | `lib/supabase.ts:12` | En production, écran d'erreur bloquant si config absente. |
| **S-12** | Clé USDA encore définie localement (`EXPO_PUBLIC_USDA_API_KEY`) ; elle a été publiée dans d'anciens bundles | `.env*` | La révoquer / régénérer. |
| **S-13** | Perf DB : 85 `auth_rls_initplan`, 498 `multiple_permissive_policies`, 4 FK sans index | advisors | Envelopper `auth.uid()` dans `(select auth.uid())`, fusionner les policies. |

### 2.D — 🟠 BUGS FONCTIONNELS

| ID | Bug | Où | Correction |
|---|---|---|---|
| **F-01** | **Code promo médecin à l'inscription ne marche JAMAIS** : il est validé à l'étape « Médecin », avant la création du compte → pas de session → `redeem_promo_code` (anon révoqué) → « Code invalide » | `app/wizard.tsx:422-452` | Mémoriser le code et le valider APRÈS `signUp`. |
| **F-02** | Si la confirmation e-mail est activée (S-05), `signUp` ne renvoie pas de session → profil enregistré en local sous `demo-user`, jamais synchronisé, sans message | `app/wizard.tsx:536-597` | Gérer « vérifiez votre e-mail » puis connexion. |
| **F-03** | **Repas dupliqué** : sauvegarder → modifier les aliments → sauvegarder = **2 repas** (glucides du jour doublés). Revoir un ancien repas, le modifier et sauvegarder crée une **copie datée de maintenant** | `app/scan-result.tsx:974-1042` | Mettre à jour la ligne existante (update `result`) au lieu de `saveMeal`. |
| **F-04** | Inscription : aucune validation (format e-mail, longueur mot de passe, e-mail déjà pris) avant les 12 étapes ; l'erreur arrive à la fin et oblige à repartir de zéro (réponses perdues) | `app/auth.tsx`, `app/wizard.tsx` | Valider sur l'écran auth ; permettre de corriger e-mail/mot de passe dans le wizard. |
| **F-05** | Clavier iOS qui cache les champs / le bouton (auth, wizard, profil) ; aucun `textContentType`/`autoComplete` (pas d'autofill mot de passe iOS) | `auth.tsx`, `wizard.tsx`, `profile-edit.tsx` | `KeyboardAvoidingView` / `automaticallyAdjustKeyboardInsets`, `textContentType`. |
| **F-06** | Suppressions **sans confirmation ni annulation** : glycémie (1 tap), activité (appui long caché), mesures (✕) | `glucose.tsx:1088`, `(tabs)/activity.tsx:300`, `(tabs)/biology.tsx:277,288` | `confirmAsync` partout (comme le Journal). |
| **F-07** | Suppression hors-ligne = « fire and forget » → la ligne **réapparaît** à la synchro suivante (y compris une insuline supprimée → IOB faux) | `services/data.ts:164-174` | File d'attente de suppressions (tombstones) rejouée par `hydrateFromServer`. |
| **F-08** | Pas d'heure réglable pour glycémie / insuline saisies à la main (toujours « maintenant ») | `log-glucose.tsx`, `log-insulin.tsx` | Sélecteur d'heure. |
| **F-09** | Code-barres : repas sauvegardé **sans moment** (petit-déj/déj/dîner) contrairement au scanner | `app/barcode.tsx:253` | Même choix de repas que le scanner. |
| **F-10** | Bolus : la dose sauvegardée ne garde pas le repas (`meal_type`) alors qu'il est connu | `app/bolus.tsx:359` | Passer `mealTime`. |
| **F-11** | Scanner : `takePictureAsync({ base64: true, quality: 1 })` (photo pleine résolution en base64 → risque mémoire sur Android bas de gamme) ; aucun try/catch sur capture/galerie | `app/scan.tsx:288,316` | `base64:false` puis `prepareImageForVision` ; try/catch. |
| **F-12** | Langue arabe au **premier lancement** : l'interface reste de gauche à droite jusqu'au redémarrage (welcome, onboarding, auth, wizard) | `i18n/index.ts` | Plugin `expo-localization` avec `supportsRTL`, ou reload. |
| **F-13** | Changer de langue vers/depuis l'arabe demande de **fermer l'app à la main** | `profile-edit.tsx:171` | `expo-updates` `reloadAsync()` ou `DevSettings`-like ; à défaut message clair (existe). |
| **F-14** | Accueil : la date « aujourd'hui » est figée au montage → app ouverte après minuit = affiche la veille | `(tabs)/index.tsx:1237` | Recalculer au focus / AppState. |
| **F-15** | Permission notifications demandée **dès l'arrivée** sur l'accueil, sans explication | `(tabs)/_layout.tsx:72`, `services/notifications.ts:191` | Pré-écran explicatif, demander au moment d'activer les rappels. |
| **F-16** | Libellé « IA » codé en dur dans le scanner (toutes langues) | `app/scan.tsx:534` | i18n. |

### 2.E — 🟡 DONNÉES / SYNCHRO

| ID | Problème | Où | Correction |
|---|---|---|---|
| **D-01** | **Données perdues pendant la synchro** : une saisie faite pendant `hydrateFromServer` est écrasée par le snapshot (perdue définitivement si hors-ligne) | `services/sync.ts:295,555` | Fusionner avec l'état courant au moment du `set`, pas avec `prevState`. |
| **D-02** | **Historique tronqué** : la synchro demande `limit(5000)` mais PostgREST plafonne à 1000 lignes → au-delà, les anciennes mesures disparaissent du téléphone | `services/sync.ts:305-361` | Paginer (`range`) ou ne garder localement que N jours. |
| **D-03** | Tout le dossier est **une seule clé AsyncStorage** sans `version`/`migrate` ; listes non bornées + miniatures base64 des analyses → risque d'échec d'écriture Android (CursorWindow 2 MB) pour les gros utilisateurs | `store/useAppStore.ts:467-470` | Versionner, borner, sortir les images. |
| **D-04** | Push hors-ligne de l'insuline sans `meal_type` | `services/sync.ts:418-425` | Ajouter le champ. |
| **D-05** | `delete-account` ne liste que 1000 fichiers par bucket → au-delà, photos laissées mais « supprimé » annoncé | `functions/delete-account/index.ts:75` | Boucle paginée. |

### 2.F — 🟡 UX / ACCESSIBILITÉ / I18N / POLISH

| ID | Problème | Où |
|---|---|---|
| **U-01** | `userInterfaceStyle: "dark"` + splash `#101014` alors que l'app est **claire** → flash sombre au lancement, dialogues système/clavier en sombre | `app.json` |
| **U-02** | Accessibilité : 468 boutons, 35 `accessibilityLabel` ; aucune gestion de la taille de police système (hauteurs fixes) | global |
| **U-03** | Textes des permissions iOS (caméra, photos, micro) **en anglais seulement** | `app.json` → `locales` |
| **U-04** | Accueil (welcome) : maquette montrant « Sommeil 70 % » — fonction inexistante | `app/welcome.tsx:473` |
| **U-05** | Disclaimer bolus « estimation de l'IA » alors que la dose vient d'un moteur déterministe (message incohérent) | i18n `bolus.disclaimer` |
| **U-06** | Rapport PDF médecin uniquement en français | `services/reportHtml.ts` |
| **U-07** | Consentement « retirer ton consentement à tout moment depuis ton profil » : **aucun écran** ne le permet ; les 4 consentements sont obligatoires (IA incluse) | i18n `consent.footer` |
| **U-08** | Consentement « pas un dispositif médical certifié » contredit la présence d'un calculateur de dose | i18n `consent.termsS1B` |
| **U-09** | 67 `fontWeight` invalides (`'750'`, `'650'`) | divers écrans |
| **U-10** | Message de support WhatsApp dit encore « GlucoAI » (ancien nom) ; support = numéro personnel allemand | `config/support.ts` |
| **U-11** | Lint : 4 `set-state-in-effect` (ai-chat, program, InstallPrompt, PastDayBanner) + 2 variables inutilisées | — |
| **U-12** | Fichier parasite `-w` (réponse d'erreur curl) versionné à la racine | `/-w` |

### 2.G — ⚙️ BUILD / CONFIG NATIVE

| ID | Problème | Correction |
|---|---|---|
| **K-01** | **expo-doctor : régression mémoire Hermes V1** avec `expo@57.0.1` / RN 0.86.0 (fuite mémoire connue) | `npx expo install expo@^57.0.9 --fix` (RN ≥ 0.86.2) |
| **K-02** | 30 paquets pas alignés sur le SDK (dont `react-native-screens` 4.25 → 4.26) | `npx expo install --check` |
| **K-03** | Pas de `ios.config.usesNonExemptEncryption: false` (question export à chaque envoi) | app.json |
| **K-04** | Pas de `ios.privacyManifests` explicite (raisons d'API + types de données collectées : santé, photos, audio, e-mail, téléphone) | app.json |
| **K-05** | `RECORD_AUDIO` + texte micro déclarés alors que le micro n'est jamais utilisé en natif ; `READ/WRITE_EXTERNAL_STORAGE` hérités | `android.blockedPermissions` (si voix reste web-only) |
| **K-06** | Pas de config `expo-notifications` (icône Android monochrome, couleur, canal) → carré blanc dans la barre de notifs | plugin `expo-notifications` |
| **K-07** | Sentry désactivé (DSN vide) → **aucun rapport de crash** en production | Activer avec le scrubbing déjà écrit |
| **K-08** | Images lourdes dans le bundle (sneaker.png 1,9 MB, héros ~1 MB) | WebP / compression |

### 2.H — 📋 HORS CODE (obligatoire pour la soumission)

- **Apple** : compte Apple Developer (99 $/an) ; fiche (captures conformes à l'app, catégorie Medical ou Health & Fitness) ; **App Privacy** (Santé, Photos, Audio, Contact, Identifiants — liés à l'utilisateur, pas de tracking) ; **compte démo** tout débloqué + notes pour le reviewer (« pas de calcul de dose » si D-2a) ; URL support + URL confidentialité ; classification d'âge (infos médicales).
- **Google Play** : déclaration **Health apps** ; **Data safety** ; URL de suppression de compte (B-10) ; compte développeur personnel → **test fermé 12 testeurs pendant 14 jours** avant la production.
- **Légal** : Politique de confidentialité + CGU (4 langues) ; **CNDP** (loi 09-08, données de santé = données sensibles) pour le Maroc ; RGPD pour l'Allemagne (sous-traitants : Supabase EU, Google Gemini, WhatsApp) ; Gemini en **facturation payante** (B-09).

---

## 3. Plan de correction par étapes

### Étape 0 — Décisions (toi, avant de coder)
- **D-1 Monétisation** : (a) app 100 % gratuite pour la v1 *(le plus rapide)* · (b) In-App Purchase / Play Billing (RevenueCat).
- **D-2 Calculateur de dose** : (a) le retirer de la v1 store, garder journal + éducation *(seule voie réaliste sans certification)* · (b) le garder avec clearance réglementaire ou sous un établissement.
- **D-3 Voix / appel IA en natif** : (a) cacher en natif pour la v1 · (b) développer la version native.
- **D-4 Labs & Mon Programme** : les garder cachés/OFF en v1 ou les sécuriser cliniquement.
- **D-5** Facturation Gemini payante + rédaction Privacy Policy / CGU + CNDP.

### Étape 1 — Bloquants stores (code)
B-01/B-02 selon D-2 · B-03/B-04 selon D-1 · B-05 · B-06 · B-07 selon D-3 · B-08/B-09 · B-11 · K-01/K-02.

### Étape 2 — Sécurité clinique
C-01 · C-02 · C-03 · C-04 · C-07 · C-08 · C-09 · C-10 · C-11 · C-12 · C-13 (+ C-05/C-06/C-15 seulement si le bolus est gardé).

### Étape 3 — Sécurité backend
S-01 (urgent, exploitable aujourd'hui) · S-02 · S-03/S-04 · S-05 + F-02 · S-06 · S-07 · S-08 · S-11.

### Étape 4 — Bugs fonctionnels
F-01 · F-03 · F-04 · F-05 · F-06 · F-07 · F-08 · F-09 · F-10 · F-11 · F-12 · F-14 · F-15 · F-16.

### Étape 5 — Données & synchro
D-01 · D-02 · D-03 · D-04 · D-05.

### Étape 6 — Finitions
U-01 → U-12 · K-03 → K-08.

### Étape 7 — Préparation soumission
Build EAS production → TestFlight + test fermé Play (12 testeurs / 14 jours) → test sur vrais iPhone + Android (inscription, scan, notifications, suppression de compte, arabe) → fiches stores, App Privacy, Data safety, compte démo → soumission.

---

## 3bis. Avancement des corrections (mis à jour le 2026-10-05)

Commits sur `main` : `ce9797a` → `142c492` (8 commits). Tests : 67 fichiers, 1590 tests verts ;
typecheck, lint-ratchet et `check:edge` verts à chaque commit. Chaque correction est épinglée par un test
(`tests/domain/storeAuditSafety.golden.test.ts`, `syncDurability`, `errorBodyOnce`, …).

**✅ Corrigé et en production (web + fonctions edge déployées)**

| Domaine | IDs |
|---|---|
| Bloquants stores | B-02 (l'IA ne calcule plus de dose), B-05 (politique `/privacy` publique + Profil → Confidentialité), B-06 (entrée « Capteurs » retirée), B-08 (consentement nomme Google Gemini, prénom seulement envoyé), B-09 (promesse « jamais d'entraînement » retirée), B-10 (page publique `/delete-account`), B-11 (mot de passe oublié + `/reset-password`) |
| Sécurité clinique | C-01, C-02, C-03, C-04, C-05, C-06, C-07, C-08, C-09, C-10, C-11 (app ; contrainte DB dans 0036), C-12 (programme bloqué grossesse / < 18 ans / âge inconnu, case « mon médecin » si les doses changent), C-13 |
| Backend | S-01 (code ; DB dans 0035), S-07 (dans 0036), S-08 (erreurs génériques, détail dans les logs) |
| Bugs | F-01, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10, F-11, F-12 (téléphone en arabe = RTL dès le 1er lancement), F-14, F-15, F-16 ; + bug trouvé en route : le message « service occupé » du scanner ne s'affichait jamais (corps de réponse lu deux fois) |
| Données | D-01, D-02, D-04, D-05 |
| Finitions / natif | U-01, U-03, U-04, U-05, U-07, U-09, U-10, U-12, K-03, K-06 |

**⏳ Écrit, en attente d'une action du propriétaire**

| Action | Pourquoi |
|---|---|
| `npx supabase --workdir glucoai db push` | applique **0035** (S-01 catalogue, taille/type des fichiers) et **0036** (bornes dose/glycémie, S-07) — refusé à l'agent (déploiement production) |
| Supabase → Auth → URL Configuration → Redirect URLs : ajouter `https://gluciai.vercel.app/reset-password` | sinon le lien de l'e-mail « mot de passe oublié » est refusé |
| Remplir `LEGAL_OWNER` + `LEGAL_CONTACT_EMAIL` dans `src/config/links.ts` | la politique doit nommer le responsable et un e-mail de contact (en attendant : « GluciAI » + support WhatsApp) |
| Vérifier que la clé Gemini est sur un projet Google Cloud **avec facturation** | conditions de l'API payante (B-09) |

**🔜 Reste à faire (phases suivantes)**

- **Phase paiement (B-03/B-04)** : In-App Purchase Apple + Google Play Billing (RevenueCat), retirer le déblocage WhatsApp du build store, compte démo reviewer.
- **Phase voix native (B-07)** : appel / notes vocales sur iPhone et Android (expo-audio + Gemini Live natif) ; d'ici là, cacher les entrées sur natif.
- **Bolus (B-01)** : interrupteur de build pour retirer le calculateur si Apple refuse (1.4.1) ; C-14/C-15 relecture clinicien.
- **Backend** : S-02 (buckets privés + URLs signées), S-03/S-04 (quotas et limites côté serveur), S-05 + F-02 (confirmation e-mail), S-06 (consentement « code médecin »), S-09 (session dans SecureStore), S-11 (pas de mode démo silencieux en production), S-12 (régénérer la clé USDA), S-13 (perf RLS).
- **Données** : D-03 (version + bornes du store persistant).
- **Finitions** : U-02 (accessibilité), U-06 (PDF médecin multilingue), U-08, U-11, F-13 (redémarrage auto après passage à l'arabe), K-01/K-02 (mise à jour Expo 57.0.x), K-04 (privacy manifest), K-05, K-07 (Sentry), K-08 (images).

---

## 4. Ce qui est déjà bien (à garder)
- Suppression de compte complète (fichiers + données) et accessible.
- Moteur bolus pur, déterministe, très testé ; garde-fous hypo / glucides inconnus.
- RLS active sur toutes les tables ; fonctions admin protégées ; clés IA côté serveur.
- Déconnexion « locale d'abord » robuste ; isolation des données entre comptes sur un même téléphone.
- i18n complète (2240 clés × 4 langues, 0 manquante).
- Gestion honnête des permissions caméra (renvoi vers Réglages).
