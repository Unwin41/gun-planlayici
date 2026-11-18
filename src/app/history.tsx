import { View } from 'react-native';

import { FOLLOWED_LABELS } from '@/chat/coach';
import { completion, recentStats, streak } from '@/chat/flow';
import { ThemedText } from '@/components/themed-text';
import { Card, Heading, ProgressBar, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-today';
import { useStore } from '@/store/useStore';
import { REASON_LABELS } from '@/types';
import { addDays, relativeDayTr } from '@/utils/date';

export default function HistoryScreen() {
  const today = useToday();
  const days = useStore((s) => s.days);

  const list = Object.values(days)
    .filter((d) => d.date <= today && d.tasks.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
  const stats = recentStats(days, addDays(today, 1), 14);
  const currentStreak = streak(days, today);

  return (
    <Screen>
      <Heading sub="Son günlerin nasıl geçti?">Geçmiş</Heading>

      <Card>
        <ThemedText type="smallBold">Seri: {currentStreak} gün</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          İşlerinin en az %80&apos;ini bitirdiğin ardışık günler.
        </ThemedText>
        {stats ? (
          <>
            <ThemedText type="small">Son 14 günde ortalama tamamlama: %{Math.round(stats.completionRate * 100)}</ThemedText>
            {stats.topReasons.length ? (
              <ThemedText type="small">En sık engeller: {stats.topReasons.map((r) => REASON_LABELS[r]).join(', ')}</ThemedText>
            ) : null}
          </>
        ) : null}
      </Card>

      {list.length === 0 ? (
        <ThemedText themeColor="textSecondary">Henüz geçmiş yok. İlk planını yaptığında burada görünecek.</ThemedText>
      ) : (
        list.map((d) => {
          const c = completion(d);
          const reasons = Object.entries(d.checkin?.reasons ?? {});
          return (
            <Card key={d.date}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <ThemedText type="smallBold">{relativeDayTr(d.date, today)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {c.done}/{c.total}
                </ThemedText>
              </View>
              <ProgressBar value={c.rate} />
              <View style={{ gap: Spacing.half }}>
                <ThemedText type="small" themeColor="textSecondary">
                  {d.checkin ? `Değerlendirme: ${FOLLOWED_LABELS[d.checkin.followed]}` : 'Değerlendirilmedi'}
                </ThemedText>
                {reasons.map(([title, r]) => (
                  <ThemedText key={title} type="small" themeColor="textSecondary">
                    • {title}: {REASON_LABELS[r]}
                  </ThemedText>
                ))}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
