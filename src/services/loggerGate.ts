/**
 * TWO DECISIONS THE CHAT HAS TO MAKE ABOUT LOGGING — both of them pure, so
 * both of them testable.
 *
 *   1. Is it worth asking the logger about this message at all?
 *   2. Is this message the patient answering the card on screen?
 *
 * WHAT WAS WRONG WITH (1). The chat used a POSITIVE keyword filter
 * (`looksLoggable`): extraction ran only when the message matched a list of
 * words. Two things made that a bug rather than an optimisation.
 *
 * First, the chat model is told the opposite. Its system prompt promises the
 * patient a card — "tell the patient to confirm the green card shown below
 * your message" — so whenever the wording fell outside the list, the AI
 * announced a card the app had already decided not to produce. The patient
 * reads "confirmez la carte", looks, and there is nothing there.
 *
 * Second, no keyword list covers four languages plus Darija written in Latin
 * letters with numbers. "j'ai pris 3 dattes", "note ça pour moi", "rani kult
 * chwiya dyal l7lawa" — all real requests, none of them matched.
 *
 * THE FILTER IS NOW NEGATIVE, and that is the whole point. The two mistakes
 * are not equivalent:
 *
 *   · a false NEGATIVE loses something the patient asked to record, silently,
 *     while the assistant tells them it was offered;
 *   · a false POSITIVE costs one extra model call on a greeting.
 *
 * So the default is to ask, and only messages that cannot be an event — a
 * bare greeting, a bare thank-you, an emoji — are skipped. The logger itself
 * already answers `action: null` for anything unloggable; it is far better at
 * that judgement than a regex, and it is the component whose job it is.
 */

/**
 * Strip punctuation, emoji and accents so the whole-message tests below can
 * be written once, in plain letters. Arabic script survives: only combining
 * marks (U+0300–U+036F, the Latin accents) are removed.
 */
function normalize(text: string): string {
  return text
    // Decompose, drop the LATIN accents (é → e, ü → u), then recompose. The
    // round-trip matters for Arabic: NFD splits "إ" into alef + hamza-below,
    // and only NFC puts it back — without it "إلغاء" would stop matching
    // itself, which is exactly the kind of silent miss this module exists to
    // prevent.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    // Arabic short-vowel marks are optional in writing ("شكراً" / "شكرا").
    .replace(/[ً-ْٰ]/g, '')
    .toLowerCase()
    // Anything that is not a letter, a digit or a space — punctuation, emoji,
    // the "!" after "merci", the apostrophe in "d'accord" — is not a word.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── 1. Is this message worth an extraction call? ── */

/** Whole-message greetings, thanks, farewells and bare acknowledgements.
 *  Nothing here can be an event the patient wants recorded. */
const NOTHING_TO_LOG = new RegExp(
  '^(?:' +
    [
      // greetings
      'salam(?: ?ou?)?(?: ?3?alaykoum?| ?aleikum| ?alaikum)?',
      'sbah l ?khir', 'msa l ?khir', 'ahlan', 'labas', 'la bas', 'ki dayr', 'ki dayra',
      'salut', 'bonjour', 'bonsoir', 'coucou', 'yo',
      'hello', 'hi', 'hey', 'good morning', 'good evening',
      'hallo', 'moin', 'guten tag', 'guten morgen', 'guten abend', 'servus',
      'مرحبا', 'اهلا', 'أهلا', 'السلام عليكم', 'سلام', 'صباح الخير', 'مساء الخير', 'لاباس',
      // thanks
      'merci(?: beaucoup| bien)?', 'chokran', 'choukran', 'shokran',
      'barak allah o? ?fik', 'thanks?(?: you| a lot)?', 'thx',
      'danke(?: schon| sehr)?',
      'شكرا', 'بارك الله فيك', 'تبارك الله',
      // farewells
      'bye', 'goodbye', 'au revoir', 'a bientot', 'bslama', 'bslamma',
      'tschuss', 'ciao', 'بسلامة', 'مع السلامة', 'الى اللقاء',
      // bare acknowledgements (a yes to an OPEN CARD is handled by
      // `cardAnswer` below, which callers check first)
      'ok', 'okay', 'oki', 'd accord', 'daccord', 'bien', 'parfait', 'super',
      'tres bien', 'nice', 'cool', 'alles klar', 'wakha', 'mezyan', 'zwin',
      'واخا', 'مزيان', 'تمام',
    ].join('|') +
    ')$',
  'iu'
);

/**
 * True when there is no point spending a model call on this message.
 *
 * Deliberately narrow: only a message that is ENTIRELY a greeting, a
 * thank-you, a farewell or a bare acknowledgement, or that has no letters or
 * digits at all (an emoji, "...", a stray "?"). Everything else goes to the
 * logger, which decides properly.
 */
export function skipLoggerExtraction(text: string): boolean {
  const clean = normalize(text);
  if (!clean) return true; // emoji-only, punctuation-only, empty
  if (clean.length > 40) return false; // too long to be a bare greeting
  return NOTHING_TO_LOG.test(clean);
}

/* ── 2. Did the patient just answer the card in words? ── */

/**
 * The card on screen asks a yes/no question, and the assistant asks it in
 * words too ("wach n'confirmiha? goul liya wah"). On a CALL the patient can
 * answer by speaking and the model calls `confirm_entry`. In the chat there
 * was no equivalent: typing "wah" started a fresh turn, and the top of
 * `send()` threw the card away. The patient answered the question they were
 * asked and their entry disappeared.
 *
 * A typed yes is a confirmation exactly like a spoken one, and it is given
 * while the card is on screen naming what will be saved or deleted. The match
 * is STRICT — the WHOLE message must be the affirmation, so "oui mais change
 * la portion" is not a yes and goes through the normal turn.
 */
const YES = new RegExp(
  '^(?:' +
    [
      // Darija / Arabic
      'wah', 'wa7', 'ah', 'aah', 'iyeh', 'iyyeh', 'ayeh', 'n3am', 'na3am',
      'akid', 'akkid', 'wakha', 'confirmi', 'confirm', 'zidha', 'zid',
      'sejjelha', 'sjjelha',
      'نعم', 'اجل', 'أجل', 'ايه', 'إيه', 'واه', 'اه', 'آه', 'اكيد', 'أكيد',
      'موافق', 'صحيح', 'زيدها', 'سجلها', 'احفظها', 'واخا',
      // French
      'oui', 'ouais', 'ouep', 'si', 'exact', 'exactement', 'voila', 'c est ca',
      'confirme', 'confirmer', 'je confirme', 'enregistre', 'enregistrer',
      'vas y', 'allez y', 'oui merci', 'oui stp', 'oui s il te plait',
      'ok', 'okay', 'd accord', 'daccord',
      // English
      'yes', 'yeah', 'yep', 'yup', 'sure', 'correct', 'right', 'confirmed',
      'go ahead', 'save it', 'add it', 'yes please',
      // German
      'ja', 'jawohl', 'genau', 'stimmt', 'richtig', 'bestatige', 'bestatigen',
      'speichern', 'ja bitte',
    ].join('|') +
    ')$',
  'iu'
);

const NO = new RegExp(
  '^(?:' +
    [
      // Darija / Arabic
      'la', 'lla', 'laa', 'machi', 'mashi', 'ma bghitch', 'mabghitch', 'annuli',
      'لا', 'لأ', 'ماشي', 'مابغيتش', 'ما بغيتش', 'الغي', 'إلغاء',
      // French
      'non', 'nan', 'annule', 'annuler', 'laisse tomber', 'pas maintenant',
      'non merci',
      // English
      'no', 'nope', 'nah', 'cancel', 'not now', 'no thanks', 'dont', 'do not',
      // German
      'nein', 'nee', 'abbrechen', 'nicht jetzt', 'nein danke',
    ].join('|') +
    ')$',
  'iu'
);

/**
 * `'yes'` / `'no'` when the whole message answers the open card, `null` for
 * anything else (including an empty message).
 *
 * Callers MUST only act on this while a confirmation card is actually on
 * screen. Outside that context "no" is just a word in a conversation, and
 * "ok" is an acknowledgement rather than an instruction to save.
 */
export function cardAnswer(text: string): 'yes' | 'no' | null {
  const clean = normalize(text);
  if (!clean || clean.length > 24) return null;
  if (YES.test(clean)) return 'yes';
  if (NO.test(clean)) return 'no';
  return null;
}
