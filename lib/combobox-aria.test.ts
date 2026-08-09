import { comboboxAria } from './combobox-aria';

const ids = { listId: 'city-list', hintId: 'city-hint' };

describe('comboboxAria', () => {
  it('is collapsed while nothing is suggested', () => {
    expect(comboboxAria({ ...ids, suggestionCount: 0, hasHint: false })['aria-expanded']).toBe(
      false,
    );
  });

  it('is expanded once suggestions are showing', () => {
    expect(comboboxAria({ ...ids, suggestionCount: 1, hasHint: false })['aria-expanded']).toBe(true);
  });

  it('names the list it controls and how it completes, expanded or not', () => {
    for (const suggestionCount of [0, 6]) {
      const aria = comboboxAria({ ...ids, suggestionCount, hasHint: false });
      expect(aria['aria-controls']).toBe('city-list');
      expect(aria['aria-autocomplete']).toBe('list');
    }
  });

  it('points at the hint only while there is one to read', () => {
    expect(
      comboboxAria({ ...ids, suggestionCount: 0, hasHint: false })['aria-describedby'],
    ).toBeUndefined();
    expect(comboboxAria({ ...ids, suggestionCount: 0, hasHint: true })['aria-describedby']).toBe(
      'city-hint',
    );
  });
});
