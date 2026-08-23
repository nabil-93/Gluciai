import { describe, expect, it } from 'vitest';

import { cardAnswer, skipLoggerExtraction } from '@/services/loggerGate';

/**
 * THE CONFIRMATION CARD THAT NEVER CAME.
 *
 * In the chat, whether the patient was offered a card at all was decided by a
 * POSITIVE keyword filter. The chat model, meanwhile, is told to promise one:
 * "tell the patient to confirm the green card shown below your message". So
 * every phrasing outside the word list produced an assistant that pointed at a
 * card the app had already decided not to build.
 *
 * The filter is negative now. These tests pin the two properties that matter:
 * nothing real is ever skipped, and the things that are skipped genuinely
 * cannot be an event.
 */
describe('what reaches the logger', () => {
  it('does not skip requests the old keyword filter had never heard of', () => {
    const missedBefore = [
      // French — no keyword in the old list matched any of these
      "j'ai pris 3 dattes",
      'note ça pour moi',
      'peux-tu mettre ça dans mon journal',
      "j'ai avalé une pomme et deux abricots",
      'ce midi une salade et du poulet grillé',
      // Darija in Latin letters
      'rani kult chwiya dyal l7lawa',
      'kan 3endi wahed lkass dyal 3assir',
      'wselt l 8000 khatwa lyoum',
      // English / German
      'add that to my day',
      'I had two slices of bread this morning',
      'ich hatte heute einen Apfel',
      'trag das bitte ein',
      // Arabic script
      'تناولت تفاحة صباحا',
      'ضع هذا في سجلي',
    ];
    for (const text of missedBefore) {
      expect(skipLoggerExtraction(text), text).toBe(false);
    }
  });

  it('still lets through everything the old filter recognised', () => {
    // No regression: the positive filter's own vocabulary must never be the
    // thing the new negative one drops.
    const known = [
      'rani dert 6 unités insuline',
      'klit tajine d lkefta',
      'ma glycémie est à 180',
      "j'ai marché 30 minutes",
      'rappelle-moi dans 1h de prendre mon insuline',
      '7eyed dak tajine',
      'chrbt kass dial lma',
      'قست السكر 140',
    ];
    for (const text of known) {
      expect(skipLoggerExtraction(text), text).toBe(false);
    }
  });

  it('skips messages that cannot be an event', () => {
    const nothing = [
      'salam',
      'Salam alaikum',
      'Bonjour !',
      'bonsoir',
      'Hello',
      'hi',
      'Guten Morgen',
      'merci',
      'Merci beaucoup !',
      'chokran',
      'thanks',
      'Danke schön',
      'شكرا',
      'مرحبا',
      'au revoir',
      'bslama',
      'ok',
      'wakha',
      'parfait',
      '👍',
      '...',
      '?',
      '   ',
    ];
    for (const text of nothing) {
      expect(skipLoggerExtraction(text), text).toBe(true);
    }
  });

  it('does not treat a greeting WITH content as a greeting', () => {
    // The old bug in miniature: the message opens politely and then states
    // the entry. Only the whole message being a greeting may be skipped.
    for (const text of [
      'salam, klit tajine',
      'Bonjour, je viens de prendre 6 unités',
      'hi, add 30 minutes of walking please',
      'merci ! et note que j ai bu un café',
    ]) {
      expect(skipLoggerExtraction(text), text).toBe(false);
    }
  });
});

/**
 * A TYPED YES IS A CONFIRMATION.
 *
 * The assistant asks "wach n'confirmiha? goul liya wah". On a call the spoken
 * yes reaches the model, which calls confirm_entry. In the chat, typing it
 * started an ordinary turn — and the first thing that turn did was clear the
 * card. The patient answered the question they were asked and lost the entry.
 *
 * The match has to be strict in one direction only: a yes SAVES data, so
 * anything that is not unambiguously an answer must fall through to the normal
 * turn rather than be guessed at.
 */
describe('answering the card in words', () => {
  it('reads a yes in every language the app speaks', () => {
    for (const text of [
      'wah', 'Wah!', 'wa7', 'ah', 'iyeh', 'n3am', 'wakha', 'akid',
      'oui', 'Oui !', 'ouais', "d'accord", 'daccord', 'je confirme', 'vas-y',
      'yes', 'Yes!', 'yeah', 'sure', 'go ahead', 'save it',
      'ja', 'Ja, bitte', 'genau', 'speichern',
      'نعم', 'أكيد', 'واه', 'موافق',
      'ok', 'OK', 'okay',
    ]) {
      expect(cardAnswer(text), text).toBe('yes');
    }
  });

  it('reads a no in every language the app speaks', () => {
    for (const text of [
      'non', 'Non !', 'nan', 'annule', 'annuler', 'laisse tomber',
      'no', 'nope', 'cancel', 'not now',
      'nein', 'Nein, danke', 'abbrechen',
      'la', 'lla', 'machi', 'mabghitch',
      'لا', 'ماشي', 'إلغاء',
    ]) {
      expect(cardAnswer(text), text).toBe('no');
    }
  });

  it('refuses to guess when the answer carries a correction', () => {
    // Every one of these CONTAINS a yes or a no. None of them IS one — they
    // change the entry, and must go to the model, not to the save function.
    for (const text of [
      'oui mais change la portion',
      'oui, mets-le en dîner pas en déjeuner',
      'yes but it was 4 units not 6',
      'no, it was chicken',
      'non, en fait c était ce matin',
      'ja, aber ohne Brot',
      'wah walakin f l3cha machi f lghda',
      'نعم ولكن في العشاء',
    ]) {
      expect(cardAnswer(text), text).toBe(null);
    }
  });

  it('is null for anything that is not an answer at all', () => {
    for (const text of [
      '',
      '   ',
      'klit tajine',
      'peut-être',
      'chnou kayn f l harira',
      'je ne sais pas',
      'What does that mean?',
    ]) {
      expect(cardAnswer(text), text).toBe(null);
    }
  });
});
