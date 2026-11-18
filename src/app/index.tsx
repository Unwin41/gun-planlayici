import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { currentPlanningDate, startCheckin, startPlanning } from '@/chat/coach';
import { completion, missedCheckinDate } from '@/chat/flow';
import { TaskItem } from '@/components/TaskItem';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Heading, ProgressBar, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-today';
import { useStore } from '@/store/useStore';
import { addDays, formatDayTr } from '@/utils/date';

export default function TodayScreen() {
  const today = useToday();
  const days = useStore((s) => s.days);
  const step = useStore((s) => s.step);
  const toggleTask = useStore((s) => s.toggleTask);
  const removeTask = useStore((s) => s.removeTask);
  const addTask = useStore((s) => s.addTask);
  const [newTitle, setNewTitle] = useState('');

  const plan = days[today];
  const tomorrow = days[addDays(today, 1)];
  const missed = missedCheckinDate(days, today);
  const { done, total, rate } = completion(plan);

  const goPlan = () => {
    const date = currentPlanningDate();
    if (!(step.kind === 'askTasks' && step.date === date)) startPlanning(date);
    router.navigate('/chat');
  };
  const goCheckin = (date: string) => {
    startCheckin(date);
    router.navigate('/chat');
  };
  const add = () => {
    if (!newTitle.trim()) return;
    addTask(today, newTitle);
    setNewTitle('');
  };

  return (
    <Screen>
      <Heading sub={formatDayTr(today)}>Bugün</Heading>

      {missed ? (
        <Card>
          <ThemedText type="smallBold">Dünkü günü kapatmadın</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Dün nasıl geçtiğini söylersen bugünün planını ona göre ayarlarım.
          </ThemedText>
          <Button label="Dünü değerlendir" onPress={() => goCheckin(missed)} />
        </Card>
      ) : null}

      {!plan || plan.tasks.length === 0 ? (
        <Card>
          <ThemedText>Bugün için henüz bir planın yok.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Koç&apos;a yapman gerekenleri yaz, sana saatli bir plan çıkarsın. İstersen aşağıdan elle de iş ekleyebilirsin.
          </ThemedText>
          <Button label={currentPlanningDate() === today ? 'Koç ile planla' : 'Koç ile yarını planla'} onPress={goPlan} />
        </Card>
      ) : (
        <>
          {plan.coachNote ? (
            <Card>
              <ThemedText type="small">{plan.coachNote}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {plan.source === 'ai' ? 'Yapay zeka planı' : plan.source === 'rules' ? 'Basit mod planı' : 'Elle oluşturuldu'}
              </ThemedText>
            </Card>
          ) : null}

          <View style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">
              {done}/{total} tamamlandı{total > 0 && done === total ? ', hepsi bitti' : ''}
            </ThemedText>
            <ProgressBar value={rate} />
          </View>

          <View>
            {plan.tasks.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={() => toggleTask(today, t.id)} onRemove={() => removeTask(today, t.id)} />
            ))}
          </View>
        </>
      )}

      <View style={styles.addRow}>
        <View style={{ flex: 1 }}>
          <Field value={newTitle} onChangeText={setNewTitle} placeholder="Elle iş ekle…" onSubmitEditing={add} returnKeyType="done" />
        </View>
        <Button label="Ekle" kind="secondary" onPress={add} disabled={!newTitle.trim()} />
      </View>

      {plan && plan.tasks.length > 0 ? (
        plan.checkin ? (
          <Card>
            <ThemedText>Bugünü kapattın.</ThemedText>
          </Card>
        ) : (
          <View style={{ gap: Spacing.two }}>
            <Button label="Günü bitir" onPress={() => goCheckin(today)} accessibilityHint="Koç planına uyup uymadığını soracak" />
            <Button label="Yeniden planla" kind="secondary" onPress={goPlan} />
          </View>
        )
      ) : null}

      {tomorrow && tomorrow.tasks.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Yarının planı hazır: {tomorrow.tasks.length} iş.
        </ThemedText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' },
});
