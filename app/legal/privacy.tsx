import { ScrollView } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Header } from '@/components/Header';
import { LegalDocument } from '@/components/LegalDocument';
import { privacyMarkdown } from '@/lib/legal/content/privacy';

export default function Privacy() {
  const { spacing } = useTheme();
  return (
    <Screen>
      <Header title="Privacy Policy" />
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'] }}>
        <LegalDocument markdown={privacyMarkdown} />
      </ScrollView>
    </Screen>
  );
}
