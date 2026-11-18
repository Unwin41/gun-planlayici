import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  answerConfirm,
  answerFollowed,
  answerReason,
  cancelFlow,
  confirmPlan,
  currentPlanningDate,
  FOLLOWED_LABELS,
  greet,
  noNewTasks,
  rewritePlan,
  startCheckin,
  startPlanning,
  submitText,
} from '@/chat/coach';
import type { ChatMessage, Step } from '@/chat/steps';
import { TaskItem } from '@/components/TaskItem';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useToday } from '@/hooks/use-today';
import { useStore } from '@/store/useStore';
import { REASON_LABELS, REASONS, type Followed } from '@/types';
import { relativeDayTr } from '@/utils/date';

function Bubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const mine = message.from === 'user';
  return (
    <View
      style={[
        styles.bubble,
        mine
          ? { alignSelf: 'flex-end', backgroundColor: theme.primary, borderBottomRightRadius: 4 }
          : { alignSelf: 'flex-start', backgroundColor: theme.backgroundElement, borderBottomLeftRadius: 4 },
      ]}>
      <ThemedText style={mine ? { color: theme.onPrimary } : undefined}>{message.text}</ThemedText>
    </View>
  );
}

function QuickReplies({ step, today }: { step: Step; today: string }) {
  const todayPlan = useStore((s) => s.days[today]);
  const chips: { label: string; onPress: () => void }[] = [];

  switch (step.kind) {
    case 'idle': {
      const date = currentPlanningDate();
      const label = date !== today ? 'Yarını planla' : todayPlan?.tasks.length ? 'Bugünü yeniden planla' : 'Bugünü planla';
      chips.push({ label, onPress: () => startPlanning(date) });
      if (todayPlan?.tasks.length && !todayPlan.checkin) chips.push({ label: 'Günü bitir', onPress: () => startCheckin(today) });
      break;
    }
    case 'askTasks':
      chips.push({ label: 'Vazgeç', onPress: cancelFlow });
      break;
    case 'review':
      chips.push({ label: 'Planı onayla', onPress: confirmPlan }, { label: 'Baştan yaz', onPress: rewritePlan });
      break;
    case 'checkinFollowed':
      (Object.keys(FOLLOWED_LABELS) as Followed[]).forEach((f) => chips.push({ label: FOLLOWED_LABELS[f], onPress: () => answerFollowed(f) }));
      break;
    case 'checkinConfirm':
      chips.push(
        { label: 'Evet, hepsini yaptım', onPress: () => answerConfirm(true) },
        { label: 'Hayır, bazılarını yapamadım', onPress: () => answerConfirm(false) },
      );
      break;
    case 'checkinReason':
      REASONS.forEach((r) => chips.push({ label: REASON_LABELS[r], onPress: () => answerReason(r) }));
      chips.push({ label: 'Aslında yaptım', onPress: () => answerReason('done') });
      break;
    case 'askTomorrow':
      chips.push({ label: 'Yeni iş yok', onPress: () => void noNewTasks() });
      break;
  }
  if (!chips.length) return null;
  return (
    <View style={styles.chips}>
      {chips.map((c) => (
        <Chip key={c.label} label={c.label} onPress={c.onPress} />
      ))}
    </View>
  );
}

function placeholderFor(step: Step): string {
  switch (step.kind) {
    case 'askTasks':
    case 'askTomorrow':
      return 'Yapman gerekenleri yaz…';
    case 'review':
      return 'Eklemek istediğin iş var mı?';
    case 'checkinReason':
      return 'Ya da kendi cümlenle anlat…';
    default:
      return 'Koç’a yaz…';
  }
}

export default function ChatScreen() {
  const theme = useTheme();
  const today = useToday();
  const messages = useStore((s) => s.messages);
  const step = useStore((s) => s.step);
  const busy = useStore((s) => s.busy);
  const [text, setText] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);

  useFocusEffect(
    useCallback(() => {
      greet();
    }, []),
  );

  const send = () => {
    const value = text;
    setText('');
    void submitText(value);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Koç burada. Bir şey yazarak başlayabilirsin.
            </ThemedText>
          ) : null}
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}

          {step.kind === 'review' ? (
            <Card style={{ alignSelf: 'stretch' }}>
              <ThemedText type="smallBold">{relativeDayTr(step.date, today)} için plan önerisi</ThemedText>
              {step.draft.tasks.map((t) => (
                <TaskItem key={t.id} task={t} />
              ))}
              {step.draft.unscheduled.length ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Sığmayanlar: {step.draft.unscheduled.join(', ')}
                </ThemedText>
              ) : null}
            </Card>
          ) : null}

          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={theme.primary} />
              <ThemedText type="small" themeColor="textSecondary">
                Plan hazırlanıyor…
              </ThemedText>
            </View>
          ) : (
            <QuickReplies step={step} today={today} />
          )}
        </ScrollView>

        <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholderFor(step)}
            placeholderTextColor={theme.textSecondary}
            multiline
            editable={!busy}
            accessibilityLabel="Mesaj"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gönder"
            disabled={busy || !text.trim()}
            onPress={send}
            style={[styles.send, { backgroundColor: theme.primary, opacity: busy || !text.trim() ? 0.4 : 1 }]}>
            <Ionicons name="send" size={20} color={theme.onPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    padding: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  bubble: { maxWidth: '85%', borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
