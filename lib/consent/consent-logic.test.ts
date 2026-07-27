import { canEnterApp, type ConsentState } from './consent-logic';
import { POLICY_VERSION, POLICY_EFFECTIVE_DATE } from '@/lib/legal/policy-meta';

describe('canEnterApp', () => {
  const base: ConsentState = { tosAccepted: false, ageConfirmed: false };

  it('blocks when nothing is accepted', () => {
    expect(canEnterApp(base)).toBe(false);
  });
  it('blocks when only terms are accepted', () => {
    expect(canEnterApp({ ...base, tosAccepted: true })).toBe(false);
  });
  it('blocks when only age is confirmed', () => {
    expect(canEnterApp({ ...base, ageConfirmed: true })).toBe(false);
  });
  it('allows only when both are true', () => {
    expect(canEnterApp({ tosAccepted: true, ageConfirmed: true })).toBe(true);
  });
});

describe('policy metadata', () => {
  it('exposes a non-empty version and effective date', () => {
    expect(POLICY_VERSION.length).toBeGreaterThan(0);
    expect(POLICY_EFFECTIVE_DATE.length).toBeGreaterThan(0);
  });
});
