/**
 * The coach's guided conversation. Questions and steps are fixed here; only plan
 * generation goes through the (hybrid) planner. Callable from any screen.
 */
import { makePlan } from '@/planner';
import { getApiKey } from '@/secureKey';
import { useStore } from '@/store/useStore';
import { REASON_LABELS, type CarryOverTask, type Followed, type Reason } from '@/types';
import { dateKey, relativeDayTr } from '@/utils/date';
import { nowMin, toMin } from '@/utils/time';

import {
  buildCarryOver,
  completion,
  mainReason,
  missedCheckinDate,
  nextPlanDate,
  planningDate,
  REASON_REPLIES,
  recentStats,
  schoolFor,
  startFromFor,
  unfinishedGroups,
} from './flow';

const S = () => useStore.getState();
const bot = (text: string) => S().addMessage('bot', text);
const user = (text: string) => S().addMessage('user', text);

export const FOLLOWED_LABELS: Record<Followed, string> = {
  yes: 'Evet, uydum',
  partly: 'Kısmen',
  no: 'Uyamadım',
};

/** Unfinished jobs already on `date`'s plan, kept when that day is re-planned. */
function existingJobs(date: string): CarryOverTask[] {
  return unfinishedGroups(S().days[date]).map((g) => ({
    title: g.baseTitle,
    category: g.category,
    durationMin: g.remainingMin,
    carryCount: g.carryCount,
    fixedStart: g.fixedStart,
  }));
}

function mergeJobs(a: CarryOverTask[], b: CarryOverTask[]): CarryOverTask[] {
  const seen = new Set(a.map((c) => c.title));
  return [...a, ...b.filter((c) => !seen.has(c.title))];
}

/** The day a new plan is for right now: today, or tomorrow if today is almost over. */
export function currentPlanningDate(): string {
  const { wakeTime, sleepTime } = S().settings;
  return planningDate(dateKey(), wakeTime, sleepTime);
}

/** Opens the conversation when the coach screen is shown and nothing is in progress. */
export function greet(): void {
  const s = S();
  if (s.step.kind !== 'idle' || s.busy) return;
  const today = dateKey();

  const missed = missedCheckinDate(s.days, today);
  if (missed) {
    startCheckin(missed);
    return;
  }
  const todayPlan = s.days[today];
  if (todayPlan?.tasks.length && !todayPlan.checkin && nowMin() >= toMin(s.settings.checkinTime)) {
    startCheckin(today);
    return;
  }
  const target = currentPlanningDate();
  if (!s.days[target]?.tasks.length) startPlanning(target);
}

export function startPlanning(date: string): void {
  const late = date !== dateKey() ? 'Bugün için geç oldu, yarını planlayalım. ' : '';
  bot(
    `${late}${relativeDayTr(date)} neler yapman gerekiyor? Virgülle ayırarak yaz. ` +
      `Saati belli olan bir iş varsa saatini, uzun sürecekse süresini de ekle.\n` +
      `Örnek: "matematik ödevi, 100 soru Türkçe, 1 saat İngilizce, saat 5'te antrenman"`,
  );
  S().setStep({ kind: 'askTasks', date, carryOver: existingJobs(date) });
}

async function generate(date: string, userText: string, carryOver: CarryOverTask[]): Promise<void> {
  const s = S();
  if (s.busy) return;
  s.setBusy(true);
  try {
    const { settings, days } = s;
    const apiKey = settings.aiEnabled ? await getApiKey() : null;
    const draft = await makePlan(
      {
        date,
        userText,
        wakeTime: settings.wakeTime,
        sleepTime: settings.sleepTime,
        startFrom: startFromFor(date, dateKey(), settings.wakeTime),
        school: schoolFor(date, settings),
        carryOver,
        recentStats: recentStats(days, date),
        grade: settings.grade,
      },
      { aiEnabled: settings.aiEnabled, apiKey },
    );
    if (draft.fallbackReason) bot(`${draft.fallbackReason} Bu yüzden planı basit modda hazırladım.`);
    bot(draft.coachNote);
    S().setStep(
      draft.tasks.length === 0 ? { kind: 'askTasks', date, carryOver } : { kind: 'review', date, carryOver, userText, draft },
    );
  } finally {
    S().setBusy(false);
  }
}

export function confirmPlan(): void {
  const s = S();
  if (s.step.kind !== 'review') return;
  const { date, draft } = s.step;
  user('Planı onayla');
  s.savePlan(date, draft);
  bot(
    date === dateKey()
      ? 'Planın hazır! "Bugün" sekmesinden yaptıklarını işaretleyebilirsin. Gün sonunda nasıl geçtiğini soracağım.'
      : `${relativeDayTr(date)} için planın hazır, "Bugün" sekmesinde seni bekliyor olacak. İyi dinlenmeler!`,
  );
  s.setStep({ kind: 'idle' });
}

export function rewritePlan(): void {
  const s = S();
  if (s.step.kind !== 'review') return;
  user('Baştan yazmak istiyorum');
  bot('Tamam, yapman gerekenleri yeniden yaz.');
  s.setStep({ kind: 'askTasks', date: s.step.date, carryOver: s.step.carryOver });
}

export function startCheckin(date: string): void {
  const s = S();
  const day = s.days[date];
  const isToday = date === dateKey();

  if (!day || completion(day).total === 0) {
    bot(`${relativeDayTr(date)} için bir planın yoktu.`);
    goNextPlan(date, {});
    return;
  }
  if (unfinishedGroups(day).length === 0) {
    s.saveCheckin(date, { followed: 'yes', reasons: {}, at: new Date().toISOString() });
    bot(`${isToday ? 'Bugün' : 'Dün'} planındaki her şeyi tamamladın. Harika iş!`);
    goNextPlan(date, {});
    return;
  }
  bot(isToday ? 'Günün sonuna geldik. Bugün planına uyabildin mi?' : 'Dünü kapatmadan önce bir soru: dün planına uyabildin mi?');
  s.setStep({ kind: 'checkinFollowed', date });
}

function askReason(date: string, followed: Followed, queue: string[], reasons: Record<string, Reason>, note?: string): void {
  bot(`«${queue[0]}» için seni ne engelledi?`);
  S().setStep({ kind: 'checkinReason', date, followed, queue, reasons, note });
}

export function answerFollowed(followed: Followed): void {
  const s = S();
  if (s.step.kind !== 'checkinFollowed') return;
  const { date } = s.step;
  user(FOLLOWED_LABELS[followed]);
  const groups = unfinishedGroups(s.days[date]);

  if (groups.length === 0) {
    finishCheckin(date, followed, {});
  } else if (followed === 'yes') {
    bot(`Listede işaretlenmemiş işler var: ${groups.map((g) => g.baseTitle).join(', ')}. Bunları da yaptın mı?`);
    s.setStep({ kind: 'checkinConfirm', date });
  } else {
    askReason(date, followed, groups.map((g) => g.baseTitle), {});
  }
}

export function answerConfirm(allDone: boolean): void {
  const s = S();
  if (s.step.kind !== 'checkinConfirm') return;
  const { date } = s.step;
  const groups = unfinishedGroups(s.days[date]);
  if (allDone) {
    user('Evet, hepsini yaptım');
    s.markDone(date, groups.flatMap((g) => g.taskIds));
    finishCheckin(date, 'yes', {});
  } else {
    user('Hayır, bazılarını yapamadım');
    askReason(date, 'partly', groups.map((g) => g.baseTitle), {});
  }
}

/** `'done'` means "I actually did this one" and ticks it off. */
export function answerReason(answer: Reason | 'done', freeText?: string): void {
  const s = S();
  if (s.step.kind !== 'checkinReason') return;
  const { date, queue } = s.step;
  let { followed, note } = s.step;
  const reasons = { ...s.step.reasons };
  const title = queue[0];

  if (answer === 'done') {
    user('Aslında yaptım');
    const group = unfinishedGroups(s.days[date]).find((g) => g.baseTitle === title);
    if (group) s.markDone(date, group.taskIds);
  } else {
    user(freeText ?? REASON_LABELS[answer]);
    reasons[title] = answer;
    if (freeText) note = note ? `${note}\n${title}: ${freeText}` : `${title}: ${freeText}`;
  }

  const rest = queue.slice(1);
  if (rest.length) {
    askReason(date, followed, rest, reasons, note);
    return;
  }
  if (unfinishedGroups(S().days[date]).length === 0) followed = 'yes';
  finishCheckin(date, followed, reasons, note);
}

function finishCheckin(date: string, followed: Followed, reasons: Record<string, Reason>, note?: string): void {
  S().saveCheckin(date, { followed, reasons, note, at: new Date().toISOString() });
  const main = mainReason(reasons);
  bot(main ? REASON_REPLIES[main] : 'Süper, planına uydun. Böyle devam!');
  goNextPlan(date, reasons);
}

function goNextPlan(checkinDate: string, reasons: Record<string, Reason>): void {
  const target = nextPlanDate(checkinDate, dateKey());
  const carried = buildCarryOver(S().days[checkinDate], reasons);
  const carryOver = mergeJobs(carried, existingJobs(target));
  const carriedText = carried.length ? ` Yarım kalanları (${carried.map((c) => c.title).join(', ')}) ben ekleyeceğim.` : '';
  bot(`${relativeDayTr(target)} için yeni yapman gereken işler neler?${carriedText} Yeni iş yoksa "Yeni iş yok"a dokun.`);
  S().setStep({ kind: 'askTomorrow', date: target, carryOver });
}

export async function noNewTasks(): Promise<void> {
  const s = S();
  if (s.step.kind !== 'askTomorrow') return;
  user('Yeni iş yok');
  if (s.step.carryOver.length === 0) {
    bot('Tamam! Yarın işlerin belli olunca bana yazabilirsin.');
    s.setStep({ kind: 'idle' });
    return;
  }
  await generate(s.step.date, '', s.step.carryOver);
}

/** Free text typed into the chat box; meaning depends on the current step. */
export async function submitText(raw: string): Promise<void> {
  const text = raw.trim();
  const s = S();
  if (!text || s.busy) return;
  const step = s.step;

  switch (step.kind) {
    case 'askTasks':
    case 'askTomorrow':
      user(text);
      await generate(step.date, text, step.carryOver);
      return;
    case 'review':
      // Extra items while reviewing: re-plan with both texts.
      user(text);
      await generate(step.date, [step.userText, text].filter(Boolean).join(', '), step.carryOver);
      return;
    case 'checkinReason':
      answerReason('diger', text);
      return;
    case 'checkinFollowed':
    case 'checkinConfirm':
      user(text);
      bot('Aşağıdaki seçeneklerden birine dokunabilir misin?');
      return;
    case 'idle': {
      const date = currentPlanningDate();
      user(text);
      await generate(date, text, existingJobs(date));
      return;
    }
  }
}

export function cancelFlow(): void {
  S().setStep({ kind: 'idle' });
  bot('Tamam, şimdilik bırakıyorum. İstediğin zaman buradayım.');
}
