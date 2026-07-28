import { ScrollView } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Header } from '@/components/Header';
import { LegalDocument } from '@/components/LegalDocument';
import { termsMarkdown } from '@/lib/legal/content/terms';

export default function Terms() {
  const { spacing } = useTheme();
  return (
    <Screen>
      <Header title="Terms of Service" />
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'] }}>
        <LegalDocument markdown={termsMarkdown} />
      </ScrollView>
    </Screen>
  );
}
