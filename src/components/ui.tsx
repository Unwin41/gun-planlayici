import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const theme = useTheme();
  const body = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: theme.background }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

export function Heading({ children, sub, centered }: { children: ReactNode; sub?: ReactNode; centered?: boolean }) {
  const align = centered ? ({ textAlign: 'center' } as const) : undefined;
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText style={[styles.heading, align]}>{children}</ThemedText>
      {sub ? (
        <ThemedText type="small" themeColor="textSecondary" style={align}>
          {sub}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]}>{children}</View>;
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'white';

const WHITE = '#ffffff';
const ON_WHITE = '#11181C';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  const bg =
    kind === 'primary' ? theme.primary : kind === 'danger' ? theme.danger : kind === 'white' ? WHITE : theme.backgroundSelected;
  const fg = kind === 'secondary' ? theme.text : kind === 'white' ? ON_WHITE : theme.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        // White on a white screen needs an edge to read as a button.
        kind === 'white' && [styles.whiteButton, { borderColor: theme.border }],
      ]}>
      <ThemedText style={[styles.buttonText, { color: fg }]}>{label}</ThemedText>
    </Pressable>
  );
}

export function Chip({ label, onPress, selected }: { label: string; onPress: () => void; selected?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: theme.primary,
          backgroundColor: selected ? theme.primary : pressed ? theme.primarySoft : 'transparent',
        },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.onPrimary : theme.primary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const theme = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: Spacing.one, flexShrink: 1 }}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }, style]}
        {...rest}
      />
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const theme = useTheme();
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: pct === 100 ? theme.success : theme.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
    alignSelf: 'center',
  },
  heading: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two },
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontWeight: 700 },
  whiteButton: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 48,
  },
  track: { height: 10, borderRadius: Radius.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.sm },
});
