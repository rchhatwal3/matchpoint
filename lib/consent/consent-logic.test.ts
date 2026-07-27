import { canEnterApp, consentRpcArgs, type ConsentState } from './consent-logic';
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

describe('consentRpcArgs', () => {
  const both: ConsentState = { tosAccepted: true, ageConfirmed: true };

  it('stamps the version and the ticked age box', () => {
    expect(consentRpcArgs(both, '2026-07-26')).toEqual({
      p_policy_version: '2026-07-26',
      p_age_confirmed: true,
    });
  });

  it('refuses an unticked age box instead of sending age_confirmed: true', () => {
    expect(() => consentRpcArgs({ tosAccepted: true, ageConfirmed: false }, '2026-07-26')).toThrow(
      'consent_required',
    );
  });

  it('refuses unaccepted terms', () => {
    expect(() => consentRpcArgs({ tosAccepted: false, ageConfirmed: true }, '2026-07-26')).toThrow(
      'consent_required',
    );
  });

  it('refuses an empty checklist', () => {
    expect(() => consentRpcArgs({ tosAccepted: false, ageConfirmed: false }, '2026-07-26')).toThrow(
      'consent_required',
    );
  });

  it('never emits age_confirmed: true for any state the checklist can be in', () => {
    for (const tosAccepted of [false, true]) {
      for (const ageConfirmed of [false, true]) {
        let args: ReturnType<typeof consentRpcArgs> | null = null;
        try {
          args = consentRpcArgs({ tosAccepted, ageConfirmed }, '2026-07-26');
        } catch {
          args = null;
        }
        if (args) expect(args.p_age_confirmed).toBe(ageConfirmed);
        else expect(tosAccepted && ageConfirmed).toBe(false);
      }
    }
  });
});

describe('policy metadata', () => {
  it('exposes a non-empty version and effective date', () => {
    expect(POLICY_VERSION.length).toBeGreaterThan(0);
    expect(POLICY_EFFECTIVE_DATE.length).toBeGreaterThan(0);
  });
});
