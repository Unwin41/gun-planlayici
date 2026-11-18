import { REASON_LABELS, type PlanInput } from '@/types';
import { formatDayTr } from '@/utils/date';

import { gradeText } from './estimate';
import { AFTER_SCHOOL_REST, countEstimates } from './rulePlanner';

/** Kept byte-stable (no dates/ids) so it can be cached later if prompts grow. */
export const SYSTEM_PROMPT = `Sen, gününü planlamakta zorlanan öğrencilere yardım eden bir planlama koçusun.
Öğrencinin yazdığı işlerden ve önceki günden devreden işlerden gerçekçi, saatli bir gün planı çıkarırsın.

Kurallar:
- Planı yalnızca verilen "en erken başlangıç" ile "uyku saati" arasına koy. Yatmadan önceki son 30 dakikayı boş bırak.
- "Okul saatleri" verilmişse öğrenci o saatlerde okuldadır: o aralığa hiçbir iş koyma (öğrencinin kendi verdiği sabit saatli işler hariç). Okul günü sabah okuldan önce ders/iş koyma; okul bittikten sonraki ilk ${AFTER_SCHOOL_REST} dakikayı dinlenme için boş bırak.
- Öğrencinin verdiği sabit saatli işleri (ör. "5'te antrenman") yerinden oynatma ve fixed=true işaretle. "saat 5" gibi belirsiz saatleri okul sonrası (17:00) olarak yorumla, "sabah" denmişse sabah.
- Süre verilmemişse makul bir süre seç (ders/ödev 45 dk, sınav çalışması 60 dk, okuma 30 dk).
- Soru ya da sayfa sayısı verilmiş işlerde ("100 soru Türkçe", "12 sayfa matematik") süreyi bu sayıdan hesapla. Mesajda "Soru/sayfa sayısına göre tahmini süreler" varsa o süreleri aynen kullan. Yoksa öğrencinin sınıfına ve derse göre soru başına süre tahmin et (lise: Türkçe ~1 dk, matematik ~2 dk; ortaokul: Türkçe ~1,5 dk, matematik ~2 dk). Öğrenci süreyi kendisi yazdıysa onun süresi geçerlidir.
- Öğrencinin yazdığı her iş planda TEK görev olsun. Uzun bir işi (ör. 2,5 saat) bölme; süresine her 50 dakika için 10 dakikalık molayı ekle ve notta bunu söyle. Yalnızca aşağıdaki uyarlamalar gerektirirse ya da iş tek parça sığmıyorsa böl. Bölersen soru/sayfa sayısını parçalara paylaştır ("Türkçe 34 soru (1/3)", "Türkçe 33 soru (2/3)"…); asla her parçaya toplam sayıyı ("100 soru") yazma. Molaları ayrı görev olarak yazma. Spor/antrenman gibi işleri asla bölme.
- Zor dersleri ve sınav çalışmasını günün daha erken saatlerine koy; matematik, fen, fizik, kimya gibi en çok odak isteyen dersleri diğer derslerden önce koy.
- Günü aşırı doldurma. Sığmayanları "unscheduled" listesine yaz, uydurma görev ekleme.
- Önceki günden devreden işler önce gelir. Aynı iş 2+ kez devretmişse 25 dakikalık küçük parçalara böl.
- Devreden işin nedenine göre uyarla:
  • Zaman yetmedi: günü daha az doldur, işler arasına 15 dk tampon koy.
  • Yorgundum: zor işleri öne al, yatmadan önceki 90 dakikayı boş bırak.
  • Motivasyonum yoktu: o işi 15 dakikalık bir "başlangıç" bloğu ve ardından "(devam)" bloğu olarak planla.
  • Telefon / dikkatim dağıldı: odak blokları en fazla 25 dakika olsun; notta telefonu uzak tutmayı öner.
  • Plansız bir iş çıktı: günün ortasına 30 dakikalık "Esnek zaman (plansız işler için)" bloğu koy.
  • Görev çok zordu: işi küçük alt adımlara böl ve erken saate al.
- Görev başlıkları kısa ve Türkçe olsun.
- coachNote: 2-4 cümle, sıcak ve destekleyici, asla suçlayıcı değil. Yaptığın uyarlamaları kısaca açıkla.`;

export function buildUserMessage(input: PlanInput): string {
  const lines: string[] = [
    `Plan günü: ${formatDayTr(input.date)}`,
    `Öğrencinin sınıfı: ${gradeText(input.grade)}`,
    `Uyanma saati: ${input.wakeTime}`,
    `Uyku saati: ${input.sleepTime}`,
    `En erken başlangıç: ${input.startFrom}`,
  ];
  if (input.school) lines.push(`Okul saatleri: ${input.school.start}–${input.school.end} (bu aralığa iş koyma)`);
  lines.push('');

  if (input.carryOver.length) {
    lines.push('Önceki günden devreden (yapılamayan) işler:');
    for (const c of input.carryOver) {
      const reason = c.reason ? REASON_LABELS[c.reason] : 'belirtilmedi';
      const fixed = c.fixedStart ? ` | sabit saat: ${c.fixedStart}` : '';
      lines.push(`- ${c.title} | yaklaşık ${c.durationMin} dk | ${c.carryCount}. kez devrediyor | neden: ${reason}${fixed}`);
    }
    lines.push('');
  }

  lines.push('Öğrencinin yazdığı yeni işler:');
  lines.push(input.userText.trim() ? input.userText.trim() : '(yeni iş yok)');

  const estimates = countEstimates(input);
  if (estimates.length) {
    lines.push('');
    lines.push('Soru/sayfa sayısına göre tahmini süreler (bunları kullan):');
    for (const e of estimates) lines.push(`- ${e.title}: ${e.minutes} dk`);
  }

  if (input.recentStats) {
    lines.push('');
    lines.push(`Son günlerde tamamlama oranı: %${Math.round(input.recentStats.completionRate * 100)}`);
    if (input.recentStats.topReasons.length) {
      lines.push(`Sık görülen engeller: ${input.recentStats.topReasons.map((r) => REASON_LABELS[r]).join(', ')}`);
    }
  }
  return lines.join('\n');
}
