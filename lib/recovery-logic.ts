// Pure helpers for the recovery-code UI (T9 Phase B). Display + input shaping for
// the /account recovery flow. Kept side-effect-free so they carry the 90% gate.

// A code is 25 symbols from the no-ambiguous alphabet (see the issue edge
// function's logic.ts): A-Z minus I/O, digits 2-9.
export const RECOVERY_CODE_LENGTH = 25;
const CODE_RE = /^[A-HJ-NP-Z2-9]{25}$/;

// Group a raw code into 5-char blocks for display: ABCDE-FGHIJ-KLMNP-...
export function groupCode(code: string): string {
  return (code.match(/.{1,5}/g) ?? []).join('-');
}

// Normalize a user-entered code to the stored form (drop spaces/dashes, upper).
// Must match the redeem edge function's normalizeCode.
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

// True when the entered code is well-formed (after normalizing). Gates the
// redeem button; does not prove the code is correct.
export function isValidRecoveryCode(raw: string): boolean {
  return CODE_RE.test(normalizeCode(raw));
}

// Plain-text block for the "download / copy codes" affordance — one grouped code
// per line.
export function codesToText(codes: string[]): string {
  return codes.map(groupCode).join('\n') + '\n';
}
