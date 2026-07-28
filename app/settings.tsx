import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/providers/SessionProvider';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { LocationChip } from '@/components/LocationChip';
import { ThemeControl } from '@/components/ThemeControl';

/** Curated popular US metros for the quick-pick list. Free text covers the rest. */
const POPULAR_METROS = [
  'New York, NY',
  'Los Angeles, CA',
  'Chicago, IL',
  'San Francisco, CA',
  'Seattle, WA',
  'Austin, TX',
  'Boston, MA',
  'Washington, DC',
  'Miami, FL',
  'Denver, CO',
  'Portland, OR',
  'San Diego, CA',
  'Nashville, TN',
  'New Orleans, LA',
  'Atlanta, GA',
  'Philadelphia, PA',
  'Houston, TX',
  'Dallas, TX',
  'Phoenix, AZ',
  'Las Vegas, NV',
  'Minneapolis, MN',
  'Charleston, SC',
  'San Antonio, TX',
  'Detroit, MI',
  'Honolulu, HI',
];

/** Title + content wrapper shared by every settings section. */
function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="title">{title}</Text>
      {children}
    </View>
  );
}

export default function Settings() {
  const { colors, spacing, radii } = useTheme();
  const router = useRouter();
  const { loading, room, updateLocations, deleteMyData } = useSession();
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = room?.locations ?? [];
  const selectedKeys = new Set(selected.map((l) => l.toLowerCase()));

  const toggle = (metro: string) => {
    const next = selectedKeys.has(metro.toLowerCase())
      ? selected.filter((l) => l.toLowerCase() !== metro.toLowerCase())
      : [...selected, metro];
    updateLocations(next).catch((e) => console.warn('updateLocations failed', e));
  };

  const remove = (metro: string) => {
    updateLocations(selected.filter((l) => l !== metro)).catch((e) =>
      console.warn('updateLocations failed', e),
    );
  };

  const addDraft = () => {
    const v = draft.trim();
    if (!v) return;
    setDraft('');
    if (selectedKeys.has(v.toLowerCase())) return;
    updateLocations([...selected, v]).catch((e) => console.warn('updateLocations failed', e));
  };

  return (
    <Screen>
      <Header title="Settings" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'], gap: spacing['3xl'] }}>
        <SettingsSection title="Appearance">
          <ThemeControl />
        </SettingsSection>

        <SettingsSection title="Account">
          <Button
            label="Manage account"
            variant="outlined"
            onPress={() => router.push('/account')}
          />
          {confirmDelete ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="body" color={colors.danger}>
                This permanently deletes your account — your data, login, and recovery codes if
                you upgraded. Shared matches stay with your partner unless they also delete. This
                can&apos;t be undone.
              </Text>
              <Button
                label="Permanently delete my account"
                variant="outlined"
                onPress={() =>
                  deleteMyData()
                    .then(() => router.replace('/'))
                    .catch((e) => console.warn('deleteMyData failed', e))
                }
              />
              <Button label="Cancel" variant="outlined" onPress={() => setConfirmDelete(false)} />
            </View>
          ) : (
            <Button label="Delete my account" variant="outlined" onPress={() => setConfirmDelete(true)} />
          )}
        </SettingsSection>

        <SettingsSection title="Legal">
          <Button label="Terms of Service" variant="outlined" onPress={() => router.push('/legal/terms')} />
          <Button label="Privacy Policy" variant="outlined" onPress={() => router.push('/legal/privacy')} />
        </SettingsSection>

        <SettingsSection title="Shared with your partner">
          {room ? (
            <View style={{ gap: spacing['3xl'] }}>
              <View style={{ gap: spacing.xs }}>
                <Text variant="body" color={colors.inkMuted}>
                  Pick the cities you two live in or would travel to. Restaurants are suggested from these.
                </Text>
                {/* Partner-visible note — both members share and can edit this list. */}
                <View
                  style={[
                    styles.note,
                    {
                      backgroundColor: colors.secondaryContainer,
                      borderRadius: radii.md,
                      padding: spacing.md,
                    },
                  ]}
                >
                  <Text variant="label" color={colors.onSecondaryContainer}>
                    Both of you share this list — either can edit, and changes sync live.
                  </Text>
                </View>
              </View>

              {/* Your locations — removable chips */}
              <View style={{ gap: spacing.md }}>
                <Text variant="title">Your locations</Text>
                {selected.length > 0 ? (
                  <View style={[styles.chipRow, { gap: spacing.sm }]}>
                    {selected.map((loc) => (
                      <LocationChip key={loc} label={loc} selected onRemove={() => remove(loc)} />
                    ))}
                  </View>
                ) : (
                  <Text variant="body" color={colors.inkMuted}>
                    No locations yet. Add one below or pick from the list.
                  </Text>
                )}
              </View>

              {/* Free-text add */}
              <View style={{ gap: spacing.sm }}>
                <Text variant="label">Add a city</Text>
                <View style={[styles.addRow, { gap: spacing.sm }]}>
                  <TextInput
                    accessibilityLabel="Add a city"
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={addDraft}
                    returnKeyType="done"
                    placeholder="e.g. Brooklyn, NY"
                    placeholderTextColor={colors.inkMuted}
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.surface,
                        color: colors.ink,
                        borderRadius: radii.md,
                        borderColor: colors.outline,
                        paddingHorizontal: spacing.lg,
                      },
                    ]}
                  />
                  <Button label="Add" variant="tonal" onPress={addDraft} disabled={!draft.trim()} />
                </View>
              </View>

              {/* Popular metros — toggle chips */}
              <View style={{ gap: spacing.md }}>
                <Text variant="title">Popular metros</Text>
                <View style={[styles.chipRow, { gap: spacing.sm }]}>
                  {POPULAR_METROS.map((metro) => (
                    <LocationChip
                      key={metro}
                      label={metro}
                      selected={selectedKeys.has(metro.toLowerCase())}
                      onPress={() => toggle(metro)}
                    />
                  ))}
                </View>
              </View>
            </View>
          ) : !loading ? (
            <Text variant="body" color={colors.inkMuted}>
              Join or create a room to set locations.
            </Text>
          ) : null}
        </SettingsSection>

        <SettingsSection title="Notifications">
          <View
            style={[
              styles.stubRow,
              { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md },
            ]}
          >
            <Text variant="body">Match alerts</Text>
            <Text variant="label" color={colors.inkMuted}>
              Coming soon
            </Text>
          </View>
        </SettingsSection>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { alignSelf: 'stretch' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  addRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    fontFamily: 'Figtree_400Regular',
    borderWidth: 1,
  },
  stubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    opacity: 0.5,
  },
});
