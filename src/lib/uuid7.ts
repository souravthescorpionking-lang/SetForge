// UUID v7 generator — app-side, time-ordered, sortable IDs.
// Works in Node and browser (no Buffer dependency).

const HEX = "0123456789abcdef";
const RANDOM = new Uint8Array(16);

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  // crypto is available globally in Node >= 19 and all browsers
  globalThis.crypto.getRandomValues(b);
  return b;
}

let lastMs = 0;
let counter = 0;

export function uuid7(): string {
  const now = Date.now();
  if (now === lastMs) {
    counter = (counter + 1) & 0xfff; // 12-bit monotonic counter within the same ms
    if (counter === 0) {
      // counter overflow within the same ms — fall back to full randomness for rand_a
      const r = randomBytes(2);
      counter = ((r[0] << 8) | r[1]) & 0xfff;
    }
  } else {
    lastMs = now;
    const r = randomBytes(2);
    counter = ((r[0] << 8) | r[1]) & 0xfff;
  }

  const b = RANDOM;
  const rnd = randomBytes(10);
  // 48-bit unix timestamp, big-endian
  b[0] = Math.floor(now / 2 ** 40) & 0xff;
  b[1] = Math.floor(now / 2 ** 32) & 0xff;
  b[2] = Math.floor(now / 2 ** 24) & 0xff;
  b[3] = (now / 2 ** 16) & 0xff;
  b[4] = (now / 2 ** 8) & 0xff;
  b[5] = now & 0xff;
  // version 7 + 12-bit counter
  b[6] = 0x70 | ((counter >> 8) & 0x0f);
  b[7] = counter & 0xff;
  // variant 10 + 62 random bits
  b[8] = 0x80 | (rnd[0] & 0x3f);
  for (let i = 1; i < 10; i++) b[8 + i] = rnd[i];

  let out = "";
  for (let i = 0; i < 16; i++) {
    out += HEX[b[i] >> 4] + HEX[b[i] & 0x0f];
    if (i === 3 || i === 5 || i === 7 || i === 9) out += "-";
  }
  return out;
}
