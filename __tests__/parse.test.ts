import { describe, expect, it } from '@jest/globals';

import { guessCategory, parseItem, parseTasksText, splitItems, stripPartSuffix, trLower } from '@/planner/parse';

describe('trLower', () => {
  it('handles Turkish dotted/dotless i', () => {
    expect(trLower('IŞIK İNGİLİZCE')).toBe('ışık ingilizce');
  });
});

describe('splitItems', () => {
  it('splits on commas, newlines, "ve" and bullets', () => {
    expect(splitItems('mat ödevi, kitap oku ve koşu\n- oda topla')).toEqual(['mat ödevi', 'kitap oku', 'koşu', 'oda topla']);
  });
});

describe('parseItem', () => {
  it('reads a duration in hours', () => {
    expect(parseItem('2 saat matematik')).toMatchObject({ title: 'Matematik', durationMin: 120, category: 'ders' });
  });

  it('reads half hours and minutes', () => {
    expect(parseItem('yarım saat kitap')).toMatchObject({ durationMin: 30, category: 'okuma' });
    expect(parseItem('45 dk ingilizce kelime')).toMatchObject({ durationMin: 45, title: 'İngilizce kelime' });
    expect(parseItem('1,5 saat fizik')).toMatchObject({ durationMin: 90 });
  });

  it("treats 'saat 5'te' as 17:00 (after school)", () => {
    expect(parseItem("saat 5'te antrenman")).toMatchObject({ title: 'Antrenman', fixedStart: '17:00', category: 'spor' });
  });

  it('keeps morning hours when "sabah" is said', () => {
    expect(parseItem('sabah 7de koşu')).toMatchObject({ fixedStart: '07:00' });
  });

  it('reads HH:mm with a suffix', () => {
    expect(parseItem("16:30'da dershane")).toMatchObject({ fixedStart: '16:30', title: 'Dershane' });
  });

  it('reads both a fixed time and a duration', () => {
    expect(parseItem("saat 18'de 1 saat basketbol")).toMatchObject({ fixedStart: '18:00', durationMin: 60, title: 'Basketbol' });
  });

  it('ignores empty leftovers', () => {
    expect(parseItem('2 saat')).toBeNull();
  });
});

describe('guessCategory', () => {
  it('prefers exam over study keywords', () => {
    expect(guessCategory('matematik denemesi')).toBe('sinav');
    expect(guessCategory('tarih ödevi')).toBe('odev');
    expect(guessCategory('annemle market')).toBe('kisisel');
    expect(guessCategory('gitar')).toBe('diger');
  });
});

describe('stripPartSuffix', () => {
  it('removes scheduler suffixes', () => {
    expect(stripPartSuffix('Matematik (2/3)')).toBe('Matematik');
    expect(stripPartSuffix('Fizik (devam)')).toBe('Fizik');
    expect(stripPartSuffix("Fizik — 15 dk'lık başlangıç")).toBe('Fizik');
    expect(stripPartSuffix('Fizik (ilk 15 dk)')).toBe('Fizik');
  });
});

it('parses a realistic message', () => {
  const items = parseTasksText("matematik ödevi, 1 saat İngilizce, saat 5'te antrenman, kitap oku");
  expect(items.map((i) => i.title)).toEqual(['Matematik ödevi', 'İngilizce', 'Antrenman', 'Kitap oku']);
});
