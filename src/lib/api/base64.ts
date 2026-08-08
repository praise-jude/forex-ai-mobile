// React Native's JS engine (Hermes) doesn't reliably expose a global btoa, so the
// "Basic <base64>" auth header needs a manual encoder. Only ASCII credentials are
// expected here (a self-chosen dashboard password), so a byte-per-char encoder is enough
// -- no UTF-8 multi-byte handling needed.
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(input: string): string {
  if (typeof btoa === "function") return btoa(input);

  let result = "";
  let i = 0;
  while (i < input.length) {
    const b1 = input.charCodeAt(i++) & 0xff;
    const b2 = i < input.length ? input.charCodeAt(i++) & 0xff : NaN;
    const b3 = i < input.length ? input.charCodeAt(i++) & 0xff : NaN;

    const n1 = b1 >> 2;
    const n2 = ((b1 & 0x03) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    const n3 = isNaN(b2) ? 64 : ((b2 & 0x0f) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    const n4 = isNaN(b3) ? 64 : b3 & 0x3f;

    result += CHARS[n1] + CHARS[n2] + (n3 === 64 ? "=" : CHARS[n3]) + (n4 === 64 ? "=" : CHARS[n4]);
  }
  return result;
}
