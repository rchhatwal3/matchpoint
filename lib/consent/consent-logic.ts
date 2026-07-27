export type ConsentState = {
  /** A1: agreed to Terms of Service + Privacy Policy. */
  tosAccepted: boolean;
  /** A2: confirmed 18 or older. */
  ageConfirmed: boolean;
};

/** Anonymous entry is allowed only once both mandatory boxes are ticked. */
export function canEnterApp(state: ConsentState): boolean {
  return state.tosAccepted && state.ageConfirmed;
}

/** The consent half of the create_room / join_room RPC arguments. */
export type ConsentRpcArgs = {
  p_policy_version: string;
  p_age_confirmed: boolean;
};

/**
 * Derive the consent stamp written to members from what the user actually
 * ticked — never a constant. Throws 'consent_required' when either box is
 * unticked, so an incomplete checklist cannot reach the RPC at all (the DB
 * CHECK in 017_consent_integrity.sql is the matching server-side stop).
 */
export function consentRpcArgs(state: ConsentState, policyVersion: string): ConsentRpcArgs {
  if (!canEnterApp(state)) throw new Error('consent_required');
  return { p_policy_version: policyVersion, p_age_confirmed: state.ageConfirmed };
}
