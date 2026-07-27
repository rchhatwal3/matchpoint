import { canEnterApp, consentRpcArgs, type ConsentState } from './consent-logic';
import { POLICY_VERSION, POLICY_EFFECTIVE_DATE } from '@/lib/legal/policy-meta';

describe('canEnterApp', () => {
  it('blocks when terms are unaccepted', () => {
    expect(canEnterApp({ tosAccepted: false })).toBe(false);
  });
  it('allows when terms are accepted', () => {
    expect(canEnterApp({ tosAccepted: true })).toBe(true);
  });
});

describe('consentRpcArgs', () => {
  const accepted: ConsentState = { tosAccepted: true };

  it('stamps the policy version', () => {
    expect(consentRpcArgs(accepted, '2026-07-26')).toEqual({
      p_policy_version: '2026-07-26',
    });
  });

  it('refuses unaccepted terms', () => {
    expect(() => consentRpcArgs({ tosAccepted: false }, '2026-07-26')).toThrow('consent_required');
  });

  it('never emits a p_age_confirmed field', () => {
    const args = consentRpcArgs(accepted, '2026-07-26');
    expect('p_age_confirmed' in args).toBe(false);
  });
});

describe('policy metadata', () => {
  it('exposes a non-empty version and effective date', () => {
    expect(POLICY_VERSION.length).toBeGreaterThan(0);
    expect(POLICY_EFFECTIVE_DATE.length).toBeGreaterThan(0);
  });
});
