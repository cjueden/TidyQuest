import crypto from 'crypto';
import { mainDb } from './mainDb';

// The family code kids and teens log in with: an adjective, an animal and two digits, like sunny-otter-42.
// It's an address, not a key (they still need their password). The words are hand-picked so no pairing
// is rude or unkind: no animal that doubles as an insult or slang, no adjective about bodies.
const ADJECTIVES = [
  'brave', 'bright', 'bouncy', 'bubbly', 'calm', 'cheery', 'chirpy', 'clever', 'comfy', 'cosmic', 'cozy',
  'curious', 'dapper', 'daring', 'dreamy', 'eager', 'epic', 'fearless', 'fluffy', 'friendly', 'frosty',
  'fuzzy', 'gentle', 'gleeful', 'golden', 'groovy', 'handy', 'happy', 'hearty', 'hopeful', 'jazzy',
  'jolly', 'joyful', 'keen', 'kind', 'lively', 'loyal', 'lucky', 'magic', 'mellow', 'merry', 'mighty',
  'minty', 'misty', 'nifty', 'nimble', 'noble', 'patient', 'peachy', 'peppy', 'perky', 'playful',
  'plucky', 'polite', 'quick', 'quiet', 'radiant', 'rosy', 'royal', 'sandy', 'shiny', 'silly', 'sleepy',
  'smiley', 'snowy', 'snug', 'sparkly', 'speedy', 'spry', 'steady', 'stellar', 'sturdy', 'sunny',
  'swift', 'tidy', 'trusty', 'upbeat', 'valiant', 'vivid', 'wise', 'witty', 'zany', 'zesty', 'zippy',
];
const ANIMALS = [
  'alpaca', 'badger', 'bison', 'bunny', 'camel', 'cheetah', 'chipmunk', 'crab', 'crane', 'cricket',
  'deer', 'dolphin', 'duck', 'eagle', 'elk', 'emu', 'falcon', 'fawn', 'finch', 'flamingo', 'fox', 'frog',
  'gecko', 'giraffe', 'goose', 'hamster', 'hedgehog', 'heron', 'hippo', 'jaguar', 'kitten', 'kiwi',
  'koala', 'ladybug', 'lamb', 'lemur', 'leopard', 'lion', 'llama', 'lobster', 'lynx', 'manatee',
  'meerkat', 'moose', 'narwhal', 'newt', 'octopus', 'orca', 'otter', 'owl', 'panda', 'parrot', 'pelican',
  'penguin', 'platypus', 'pony', 'puffin', 'quokka', 'rabbit', 'raccoon', 'robin', 'seal', 'sloth',
  'sparrow', 'squid', 'squirrel', 'starfish', 'stork', 'swan', 'tiger', 'toucan', 'turtle', 'walrus',
  'wallaby', 'wolf', 'wombat', 'yak', 'zebra',
];

/** What logins compare: capitals, spaces, dashes and anything else but letters and digits don't matter. */
export function codeKey(input: unknown): string {
  return typeof input === 'string' ? input.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function randomCode(): string {
  const pick = (words: string[]) => words[crypto.randomInt(words.length)];
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${crypto.randomInt(10, 100)}`;
}

/** Gives the family a new code (its old one stops working at once) and returns it. */
export function newFamilyCode(familyId: string): string {
  const main = mainDb();
  for (;;) {
    const code = randomCode();
    if (main.prepare('SELECT 1 FROM families WHERE codeKey = ?').get(codeKey(code))) continue;
    main.prepare('UPDATE families SET code = ?, codeKey = ? WHERE id = ?').run(code, codeKey(code), familyId);
    return code;
  }
}

/** The live family with this code, if any. */
export function familyIdByCode(input: unknown): string | null {
  const key = codeKey(input);
  if (!key || key.length > 40) return null;
  const row = mainDb().prepare('SELECT id FROM families WHERE codeKey = ? AND deletedAt IS NULL').get(key) as { id: string } | undefined;
  return row?.id ?? null;
}
