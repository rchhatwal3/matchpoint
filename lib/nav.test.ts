import { parentRoute } from './nav';

describe('parentRoute', () => {
  it('settings goes to lobby with a room, else the entry screen', () => {
    expect(parentRoute('/settings', true)).toBe('/lobby');
    expect(parentRoute('/settings', false)).toBe('/');
    expect(parentRoute('/matchpoint/settings', true)).toBe('/lobby');
    expect(parentRoute('/matchpoint/settings', false)).toBe('/');
  });

  it('account always goes to settings, regardless of room', () => {
    expect(parentRoute('/account', true)).toBe('/settings');
    expect(parentRoute('/account', false)).toBe('/settings');
    expect(parentRoute('/matchpoint/account', true)).toBe('/settings');
    expect(parentRoute('/matchpoint/account', false)).toBe('/settings');
  });

  it('legal terms goes to settings with a room, else the entry screen', () => {
    expect(parentRoute('/legal/terms', true)).toBe('/settings');
    expect(parentRoute('/legal/terms', false)).toBe('/');
    expect(parentRoute('/matchpoint/legal/terms', true)).toBe('/settings');
    expect(parentRoute('/matchpoint/legal/terms', false)).toBe('/');
  });

  it('legal privacy goes to settings with a room, else the entry screen', () => {
    expect(parentRoute('/legal/privacy', true)).toBe('/settings');
    expect(parentRoute('/legal/privacy', false)).toBe('/');
    expect(parentRoute('/matchpoint/legal/privacy', true)).toBe('/settings');
    expect(parentRoute('/matchpoint/legal/privacy', false)).toBe('/');
  });

  it('any swipe deck goes to the lobby, regardless of room', () => {
    expect(parentRoute('/swipe/restaurants', true)).toBe('/lobby');
    expect(parentRoute('/swipe/restaurants', false)).toBe('/lobby');
    expect(parentRoute('/swipe/vacations', true)).toBe('/lobby');
    expect(parentRoute('/matchpoint/swipe/restaurants', true)).toBe('/lobby');
    expect(parentRoute('/matchpoint/swipe/restaurants', false)).toBe('/lobby');
  });

  it('matches goes to the lobby, regardless of room', () => {
    expect(parentRoute('/matches', true)).toBe('/lobby');
    expect(parentRoute('/matches', false)).toBe('/lobby');
    expect(parentRoute('/matchpoint/matches', true)).toBe('/lobby');
    expect(parentRoute('/matchpoint/matches', false)).toBe('/lobby');
  });

  it('date-night goes to the lobby, regardless of room', () => {
    expect(parentRoute('/date-night', true)).toBe('/lobby');
    expect(parentRoute('/date-night', false)).toBe('/lobby');
    expect(parentRoute('/matchpoint/date-night', true)).toBe('/lobby');
    expect(parentRoute('/matchpoint/date-night', false)).toBe('/lobby');
  });

  it('falls back to lobby with a room, else the entry screen, for unlisted routes', () => {
    expect(parentRoute('/unknown', true)).toBe('/lobby');
    expect(parentRoute('/unknown', false)).toBe('/');
    expect(parentRoute('/matchpoint/unknown', true)).toBe('/lobby');
    expect(parentRoute('/matchpoint/unknown', false)).toBe('/');
  });

  it('handles a trailing slash', () => {
    expect(parentRoute('/settings/', true)).toBe('/lobby');
    expect(parentRoute('/swipe/restaurants/', true)).toBe('/lobby');
    expect(parentRoute('/matchpoint/settings/', false)).toBe('/');
  });

  it('handles the bare base path as the root', () => {
    expect(parentRoute('/matchpoint', true)).toBe('/lobby');
    expect(parentRoute('/matchpoint', false)).toBe('/');
    expect(parentRoute('/matchpoint/', true)).toBe('/lobby');
  });
});
