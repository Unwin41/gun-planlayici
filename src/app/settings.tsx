import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Switch, View } from 'react-native';

import { DayTimesFields, GradePicker } from '@/components/Onboarding';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Heading, Screen } from '@/components/ui';
import { AI_MODEL } from '@/config';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scheduleDailyCheckin } from '@/notifications';
import { deleteApiKey, getApiKey, maskKey, setApiKey } from '@/secureKey';
import { useStore } from '@/store/useStore';
import { gradeLabel } from '@/types';
import { dayTimesForm, readDayTimes, type DayTimesForm } from '@/utils/dayTimes';

export default function SettingsScreen() {
  const theme = useTheme();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const resetAll = useStore((s) => s.resetAll);

  const [times, setTimes] = useState<DayTimesForm>(() => dayTimesForm(settings));
  const [timeMsg, setTimeMsg] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getApiKey().then(setSavedKey);
      setConfirmReset(false);
    }, []),
  );

  const saveTimes = async () => {
    const parsed = readDayTimes(times);
    if (!parsed.ok) {
      setTimeMsg(parsed.error);
      return;
    }
    updateSettings(parsed.value);
    setTimes(dayTimesForm({ ...settings, ...parsed.value }));
    const checkin = parsed.value.checkinTime;
    const ok = await scheduleDailyCheckin(checkin);
    setTimeMsg(
      ok
        ? `Kaydedildi. Her gün ${checkin}'de hatırlatacağım.`
        : Platform.OS === 'web'
          ? 'Kaydedildi. Web sürümünde bildirim yok, gün sonunu kendin başlatabilirsin.'
          : 'Kaydedildi. Bildirim izni yok, gün sonunu kendin başlatabilirsin.',
    );
  };

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    await setApiKey(keyInput);
    setSavedKey(keyInput.trim());
    setKeyInput('');
    updateSettings({ aiEnabled: true });
  };

  const removeKey = async () => {
    await deleteApiKey();
    setSavedKey(null);
    updateSettings({ aiEnabled: false });
  };

  const aiActive = settings.aiEnabled && !!savedKey;

  return (
    <Screen>
      <Heading>Ayarlar</Heading>

      <Card>
        <ThemedText type="smallBold">Sınıfın</ThemedText>
        <GradePicker value={settings.grade} onChange={(grade) => updateSettings({ grade })} />
        <ThemedText type="small" themeColor="textSecondary">
          Soru çözme süreleri buna göre tahmin edilir{settings.grade !== undefined ? ` (şu an: ${gradeLabel(settings.grade)})` : ''}.
        </ThemedText>
      </Card>

      <DayTimesFields form={times} onChange={(patch) => setTimes((t) => ({ ...t, ...patch }))} />
      <Button label="Saatleri kaydet" onPress={saveTimes} />
      {timeMsg ? (
        <ThemedText type="small" themeColor="textSecondary">
          {timeMsg}
        </ThemedText>
      ) : null}

      {/* Public web build: no secure storage, so don't ask students for an API key there. */}
      {Platform.OS !== 'web' ? (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }}>
          <ThemedText type="smallBold" style={{ flex: 1 }}>
            Yapay zeka ile planla
          </ThemedText>
          <Switch
            value={settings.aiEnabled}
            onValueChange={(v) => updateSettings({ aiEnabled: v })}
            accessibilityLabel="Yapay zeka ile planla"
            trackColor={{ true: theme.primary }}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Durum: {aiActive ? `açık (${AI_MODEL})` : savedKey ? 'kapalı, basit mod' : 'anahtar yok, basit mod'}
          {savedKey ? ` · anahtar ${maskKey(savedKey)}` : ''}
        </ThemedText>
        <Field
          value={keyInput}
          onChangeText={setKeyInput}
          placeholder={savedKey ? 'Yeni anahtar…' : 'Claude API anahtarı (sk-ant-...)'}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={{ flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' }}>
          <View style={{ flexGrow: 1 }}>
            <Button label="Anahtarı kaydet" onPress={saveKey} disabled={!keyInput.trim()} />
          </View>
          {savedKey ? (
            <View style={{ flexGrow: 1 }}>
              <Button label="Anahtarı sil" kind="secondary" onPress={removeKey} />
            </View>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Yapay zeka açıkken yalnızca yazdığın işler, saatler ve &quot;neden yapamadım&quot; cevapların plan hazırlamak için Anthropic&apos;e
          gönderilir. Adın ya da kimlik bilgin gönderilmez. Anahtar yalnızca bu cihazda, şifreli saklanır.
        </ThemedText>
      </Card>
      ) : null}

      <Card>
        <ThemedText type="smallBold">Veriler</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Planların ve geçmişin yalnızca bu cihazda saklanır.
        </ThemedText>
        <Button
          label={confirmReset ? 'Emin misin? Tekrar dokun' : 'Tüm verileri sil'}
          kind="danger"
          onPress={async () => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            await deleteApiKey();
            resetAll();
          }}
        />
      </Card>
    </Screen>
  );
}
