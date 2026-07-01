import crypto from "crypto";

// ────────────────────────────────────────────────────────────────────────────
// TRON (TRC20) address validation — dependency-free base58check.
//
// A TRON address is base58check of a 25-byte payload: 0x41 prefix + 20-byte
// account + 4-byte checksum (first 4 bytes of sha256(sha256(payload[:-4]))).
// We validate the shape AND the checksum, so typo'd / invalid addresses are
// rejected before any deposit attribution or withdrawal request is accepted.
// ────────────────────────────────────────────────────────────────────────────

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(input: string): Uint8Array | null {
  const bytes: number[] = [0];
  for (const ch of input) {
    const value = ALPHABET.indexOf(ch);
    if (value === -1) return null; // non-base58 character
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Preserve leading zero bytes (encoded as leading '1's).
  for (let k = 0; k < input.length && input[k] === "1"; k++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

function sha256(buf: Uint8Array): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

/** True only for a well-formed, checksum-valid mainnet TRON (TRC20) address. */
export function isValidTronAddress(addr: string): boolean {
  if (typeof addr !== "string") return false;
  // Base58 T-address: 34 chars, starts with T, base58 alphabet only.
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return false;

  const data = base58Decode(addr);
  if (!data || data.length !== 25) return false;
  if (data[0] !== 0x41) return false; // mainnet prefix

  const payload = data.subarray(0, 21);
  const checksum = data.subarray(21);
  const hash = sha256(sha256(payload));
  for (let i = 0; i < 4; i++) if (checksum[i] !== hash[i]) return false;
  return true;
}

/** Normalise for comparison (TRON base58 is case-sensitive; just trims). */
export function normalizeTron(addr: string): string {
  return (addr || "").trim();
}
