import { Linking, ScrollView, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Text } from '@/components/Text';
import { parseMarkdown, type Block, type Inline } from '@/lib/legal/parse-markdown';

function Spans({ spans }: { spans: Inline[] }) {
  const { colors } = useTheme();
  return (
    <Text variant="body">
      {spans.map((s, k) => (
        <Text
          key={k}
          variant="body"
          color={s.href ? colors.primary : undefined}
          style={{ fontWeight: s.bold ? '700' : undefined, fontStyle: s.italic ? 'italic' : undefined }}
          onPress={s.href ? () => void Linking.openURL(s.href as string) : undefined}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

export function LegalDocument({ markdown }: { markdown: string }) {
  const { spacing } = useTheme();
  const blocks: Block[] = parseMarkdown(markdown);
  return (
    <View style={{ gap: spacing.lg }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <Text key={i} variant={b.level === 1 ? 'headline' : b.level === 2 ? 'title' : 'label'}>
                {b.spans.map((s) => s.text).join('')}
              </Text>
            );
          case 'rule':
            return <View key={i} />;
          case 'bullets':
            return (
              <View key={i} style={{ gap: spacing.xs, paddingLeft: spacing.md }}>
                {b.items.map((it, k) => (
                  <Spans key={k} spans={[{ text: '•  ' }, ...it]} />
                ))}
              </View>
            );
          case 'quote':
            return <Spans key={i} spans={b.spans} />;
          case 'table':
            return (
              <ScrollView key={i} horizontal>
                <View style={{ gap: spacing.xs }}>
                  {[b.header, ...b.rows].map((row, r) => (
                    <View key={r} style={{ flexDirection: 'row', gap: spacing.md }}>
                      {row.map((cell, c) => (
                        <View key={c} style={{ width: 160 }}>
                          <Spans spans={cell} />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          default:
            return <Spans key={i} spans={b.spans} />;
        }
      })}
    </View>
  );
}
