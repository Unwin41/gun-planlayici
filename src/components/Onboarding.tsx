import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scheduleDailyCheckin } from '@/notifications';
import { useStore } from '@/store/useStore';
import { GRADES, type Grade } from '@/types';
import { dayTimesForm, readDayTimes, type DayTimesForm } from '@/utils/dayTimes';

import { ThemedText } from './themed-text';
import { Button, Card, Chip, Field, Heading, Screen } from './ui';

/** Wake / sleep / day-end times plus school hours. Shared by onboarding and settings. */
export function DayTimesFields({
  form,
  onChange,
  askSchool = true,
  centered = false,
}: {
  form: DayTimesForm;
  onChange: (patch: Partial<DayTimesForm>) => void;
  /** false = do not ask "Okula gidiyor musun?"; the current value is kept. */
  askSchool?: boolean;
  centered?: boolean;
}) {
  const align = centered ? ({ textAlign: 'center' } as const) : undefined;
  return (
    <>
      <Card>
        <ThemedText type="smallBold" style={align}>
          Günün saatleri
        </ThemedText>
        <View style={styles.row}>
          <View style={styles.cell}>
            <Field label="Uyanma" value={form.wake} onChangeText={(v) => onChange({ wake: v })} keyboardType="numbers-and-punctuation" placeholder="07:30" />
          </View>
          <View style={styles.cell}>
            <Field label="Uyku" value={form.sleep} onChangeText={(v) => onChange({ sleep: v })} keyboardType="numbers-and-punctuation" placeholder="23:00" />
          </View>
          <View style={styles.cell}>
            <Field label="Gün sonu" value={form.checkin} onChangeText={(v) => onChange({ checkin: v })} keyboardType="numbers-and-punctuation" placeholder="21:00" />
          </View>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={align}>
          Gün sonu saatinde sana bir bildirim gönderip gününün nasıl geçtiğini soracağım.
        </ThemedText>
      </Card>

      {askSchool || form.goesToSchool ? (
      <Card>
        {askSchool ? (
          <>
            <ThemedText type="smallBold" style={align}>
              Okula gidiyor musun?
            </ThemedText>
            <View style={[styles.chips, centered && styles.centerChips]}>
              <Chip label="Evet" selected={form.goesToSchool} onPress={() => onChange({ goesToSchool: true })} />
              <Chip label="Hayır" selected={!form.goesToSchool} onPress={() => onChange({ goesToSchool: false })} />
            </View>
          </>
        ) : null}
        {form.goesToSchool ? (
          <>
            <View style={styles.row}>
              <View style={styles.cell}>
                <Field
                  label="Okula giriş"
                  value={form.schoolStart}
                  onChangeText={(v) => onChange({ schoolStart: v })}
                  keyboardType="numbers-and-punctuation"
                  placeholder="08:30"
                />
              </View>
              <View style={styles.cell}>
                <Field
                  label="Okuldan çıkış"
                  value={form.schoolEnd}
                  onChangeText={(v) => onChange({ schoolEnd: v })}
                  keyboardType="numbers-and-punctuation"
                  placeholder="15:30"
                />
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={align}>
              Hafta içi bu saatler arasına iş koymayacağım.
            </ThemedText>
          </>
        ) : null}
      </Card>
      ) : null}
    </>
  );
}

export function GradePicker({ value, onChange, centered }: { value?: Grade; onChange: (grade: Grade) => void; centered?: boolean }) {
  return (
    <View style={[styles.chips, centered && styles.centerChips]}>
      {GRADES.map((g) => (
        <Chip key={String(g)} label={g === 'mezun' ? 'Mezun' : String(g)} selected={value === g} onPress={() => onChange(g)} />
      ))}
    </View>
  );
}

const GRADE_HINT =
  'Soru çözme sürelerini sınıfına göre tahmin ediyorum. Örneğin "100 soru Türkçe" bir lise öğrencisi için yaklaşık 2 saat sürer.';

/** Shown once to students who set the app up before the grade question existed. */
export function GradePrompt() {
  const updateSettings = useStore((s) => s.updateSettings);
  const [grade, setGrade] = useState<Grade | undefined>();
  return (
    <Screen>
      <Heading sub={GRADE_HINT}>Kaçıncı sınıftasın?</Heading>
      <Card>
        <GradePicker value={grade} onChange={setGrade} />
      </Card>
      <Button label="Devam" disabled={grade === undefined} onPress={() => updateSettings({ grade })} />
    </Screen>
  );
}

const STEP_COUNT = 2;

function StepDots({ step }: { step: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="small" themeColor="textSecondary">
        Adım {step + 1} / {STEP_COUNT}
      </ThemedText>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= step ? theme.primary : theme.backgroundSelected }]} />
        ))}
      </View>
    </View>
  );
}

/** First-run setup, one question per step: grade → day & school times. */
export function Onboarding() {
  const theme = useTheme();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [step, setStep] = useState(0);
  const [grade, setGrade] = useState<Grade | undefined>(settings.grade);
  const [times, setTimes] = useState<DayTimesForm>(() => ({
    ...dayTimesForm(settings),
    goesToSchool: settings.grade !== 'mezun',
  }));
  const [error, setError] = useState<string | null>(null);

  const go = (to: number) => {
    setError(null);
    setStep(to);
  };

  const finish = () => {
    const parsed = readDayTimes(times);
    if (grade === undefined) return;
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    // The AI key is no longer asked here; it can still be added later in Settings.
    updateSettings({ ...parsed.value, grade, onboarded: true });
    void scheduleDailyCheckin(parsed.value.checkinTime);
  };

  const next = () => {
    if (step === 0) {
      if (grade !== undefined) go(1);
      return;
    }
    finish();
  };

  return (
    <Screen>
      <StepDots step={step} />

      {step === 0 ? (
        <>
          <Heading centered sub="Gününü birlikte planlayalım. Önce seni biraz tanıyayım.">
            Merhaba!
          </Heading>
          <Card>
            <ThemedText type="smallBold" style={styles.centerText}>
              Kaçıncı sınıftasın?
            </ThemedText>
            <GradePicker
              centered
              value={grade}
              onChange={(g) => {
                setGrade(g);
                // Graduates usually do not go to school; everyone else does.
                setTimes((t) => ({ ...t, goesToSchool: g !== 'mezun' }));
                setError(null);
              }}
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {GRADE_HINT}
            </ThemedText>
          </Card>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <Heading centered sub="Planı bu saatlere göre kuracağım. Sonra Ayarlar'dan değiştirebilirsin.">
            Günün nasıl geçiyor?
          </Heading>
          <DayTimesFields
            askSchool={false}
            centered
            form={times}
            onChange={(patch) => {
              setTimes((t) => ({ ...t, ...patch }));
              setError(null);
            }}
          />
        </>
      ) : null}

      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}

      {/* Pushes the buttons to the bottom of the screen. */}
      <View style={styles.spacer} />

      <View style={styles.footer}>
        {step > 0 ? (
          <View style={styles.back}>
            <Button label="Geri" kind="secondary" onPress={() => go(step - 1)} />
          </View>
        ) : null}
        <View style={styles.forward}>
          <Button
            label={step === STEP_COUNT - 1 ? 'Başla' : 'İlerle'}
            kind="white"
            disabled={step === 0 && grade === undefined}
            onPress={next}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  cell: { flexGrow: 1, flexBasis: 90 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  centerChips: { justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  dots: { flexDirection: 'row', gap: Spacing.one },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  spacer: { flexGrow: 1 },
  footer: { flexDirection: 'row', gap: Spacing.two },
  back: { flexBasis: 100 },
  forward: { flex: 1 },
});
