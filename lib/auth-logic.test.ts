import { normalizeEmail, isValidEmail, isValidCode, authView } from './auth-logic';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com');
  });
});

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
  });
  it('rejects missing @ / domain / spaces', () => {
    expect(isValidEmail('ab.co')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.co')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('isValidCode', () => {
  it('accepts exactly six digits (trimmed)', () => {
    expect(isValidCode(' 123456 ')).toBe(true);
  });
  it('rejects wrong length or non-digits', () => {
    expect(isValidCode('12345')).toBe(false);
    expect(isValidCode('1234567')).toBe(false);
    expect(isValidCode('12a456')).toBe(false);
  });
});

describe('authView', () => {
  it('permanent when not anonymous and has email', () => {
    expect(authView({ isAnonymous: false, email: 'a@b.co', codeSent: false })).toBe('permanent');
  });
  it('code-sent when anonymous and a code was sent', () => {
    expect(authView({ isAnonymous: true, email: null, codeSent: true })).toBe('code-sent');
  });
  it('anonymous by default', () => {
    expect(authView({ isAnonymous: true, email: null, codeSent: false })).toBe('anonymous');
  });
});
