import {
  RECOVERY_CODE_LENGTH,
  codesToText,
  groupCode,
  isValidRecoveryCode,
  normalizeCode,
} from './recovery-logic';

describe('groupCode', () => {
  it('splits into 5-char dash-joined blocks', () => {
    expect(groupCode('ABCDEFGHJKLMNPQRSTUVWXYZ2')).toBe('ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2');
  });
  it('handles a short remainder and empty input', () => {
    expect(groupCode('ABCDEFG')).toBe('ABCDE-FG');
    expect(groupCode('')).toBe('');
  });
});

describe('normalizeCode', () => {
  it('strips spaces and dashes and uppercases', () => {
    expect(normalizeCode('abcde-fghjk lmnpq')).toBe('ABCDEFGHJKLMNPQ');
  });
});

describe('isValidRecoveryCode', () => {
  it('accepts a 25-char code with or without separators', () => {
    const raw = 'ABCDEFGHJKLMNPQRSTUVWXYZ2';
    expect(raw.length).toBe(RECOVERY_CODE_LENGTH);
    expect(isValidRecoveryCode(raw)).toBe(true);
    expect(isValidRecoveryCode('abcde-fghjk-lmnpq-rstuv-wxyz2')).toBe(true);
  });
  it('rejects wrong length or ambiguous glyphs (0/O/1/I)', () => {
    expect(isValidRecoveryCode('ABCDE')).toBe(false);
    expect(isValidRecoveryCode('ABCDEFGHJKLMNPQRSTUVWXYZO')).toBe(false); // O
    expect(isValidRecoveryCode('ABCDEFGHJKLMNPQRSTUVWXYZ0')).toBe(false); // 0
  });
});

describe('codesToText', () => {
  it('grants one grouped code per line with a trailing newline', () => {
    expect(codesToText(['ABCDEFGHJK', 'LMNPQRSTUV'])).toBe('ABCDE-FGHJK\nLMNPQ-RSTUV\n');
  });
});
