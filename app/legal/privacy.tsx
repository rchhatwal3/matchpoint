import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Header } from '@/components/Header';
import { LegalDocument } from '@/components/LegalDocument';
import { privacyMarkdown } from '@/lib/legal/content/privacy';

export default function Privacy() {
  const { spacing } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <Header title="Privacy Policy" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing['2xl'] }}>
        <LegalDocument markdown={privacyMarkdown} />
      </ScrollView>
    </Screen>
  );
}
