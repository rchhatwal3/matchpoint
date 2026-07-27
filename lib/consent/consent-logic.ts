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
