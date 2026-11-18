import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/types';

import { ThemedText } from './themed-text';

export function TaskItem({ task, onToggle, onRemove }: { task: Task; onToggle?: () => void; onRemove?: () => void }) {
  const theme = useTheme();
  const time = task.start && task.end ? `${task.start}–${task.end}` : 'Saat yok';
  const label = `${task.title}, ${time}${task.done ? ', yapıldı' : ''}`;

  return (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done, disabled: !onToggle }}
        accessibilityLabel={label}
        disabled={!onToggle}
        onPress={onToggle}
        hitSlop={6}
        style={styles.main}>
        <View
          style={[
            styles.box,
            { borderColor: task.done ? theme.success : theme.textSecondary, backgroundColor: task.done ? theme.success : 'transparent' },
          ]}>
          {task.done ? <Ionicons name="checkmark" size={18} color={theme.background} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText
            style={[task.done && styles.doneText, task.flex && { fontStyle: 'italic' }]}
            themeColor={task.done ? 'textSecondary' : 'text'}>
            {task.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {time}
            {task.fixed ? ' · sabit saat' : ''}
            {task.carryCount > 0 ? ` · ${task.carryCount}. kez erteleme` : ''}
          </ThemedText>
        </View>
      </Pressable>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${task.title} görevini sil`} onPress={onRemove} hitSlop={10} style={styles.remove}>
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 44 },
  box: { width: 26, height: 26, borderRadius: Radius.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  doneText: { textDecorationLine: 'line-through' },
  remove: { padding: Spacing.two, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
