import { describe, expect, it } from 'vitest';
import { cleanName } from '@/lib/catalog/cleanName';

describe('cleanName', () => {
  it.each([
    ['US| HARBOR NEWS 24 ᴴᴰ/ᴿᴬᵂ', 'Harbor News 24', null, ['US', 'HD']],
    ['UK| ARC SPORTS 1 FHD ⁶⁰ᶠᵖˢ', 'Arc Sports 1', null, ['UK', 'FHD', '60 fps']],
    ['4K-A+ - Glass Orchard (2024)', 'Glass Orchard', 2024, ['4K']],
    ['123.Low.Tide.Motel.1997', 'Low Tide Motel', 1997, []],
    ['123.L.A.Confidential.1997', 'L.A. Confidential', 1997, []],
    ['3D-DE - Alles fliegt dir um die Ohren (1981)', 'Alles fliegt dir um die Ohren', 1981, ['DE', '3D']],
    ['Velvet.Underpass.2021.1080p', 'Velvet Underpass', 2021, ['FHD']],
    ["EN - The Cartographer's Daughter (2023)", "The Cartographer's Daughter", 2023, ['EN']],
    ['EN - Ninth Floor (2024) [MULTI-SUB]', 'Ninth Floor', 2024, ['EN', 'Subs']],
    ['EN| Northbound 2024', 'Northbound', 2024, ['EN']],
    ['Paper Lanterns (2022)', 'Paper Lanterns', 2022, []],
    ['Meridian Line ᴴᴰ', 'Meridian Line', null, ['HD']],
    ['UK| SPORTS ⁴ᴷ ³⁸⁴⁰ᴾ', 'Sports', null, ['UK', '4K']],
    ['4K| RELAX ᵁᴴᴰ ³⁸⁴⁰ᴾ ☼', 'Relax', null, ['4K']],
    ['IE| RUGBY PPV', 'Rugby PPV', null, ['IE']],
    ['UK| 24/7 HD/RAW', '24/7', null, ['UK', 'HD']],
    ['US| BBC ONE HD', 'BBC One', null, ['US', 'HD']],
    ['US| 24/7 ACTION/ADVENTURE ᴿᴬᵂ ⁶⁰ᶠᵖˢ', '24/7 Action/Adventure', null, ['US', '60 fps']],
  ])('cleans %j', (raw, title, year, tags) => {
    const result = cleanName(raw);
    expect(result.title).toBe(title);
    expect(result.year).toBe(year);
    expect(result.tags).toEqual(tags);
    expect(result.isSeparator).toBe(false);
  });

  it.each([
    '##### US ENTERTAINMENT #####',
    '## 24/7 ACTION/ADVENTURE ᴿᴬᵂ ⁶⁰ᶠᵖˢ ##',
    '━━━━ SPORTS ━━━━',
    '==========',
  ])('marks %j as a separator', (raw) => {
    expect(cleanName(raw).isSeparator).toBe(true);
  });

  it('keeps names that are already clean untouched', () => {
    expect(cleanName('Detective Hale')).toEqual({
      title: 'Detective Hale',
      year: null,
      tags: [],
      region: null,
      isSeparator: false,
    });
  });

  it('exposes the country or language tag as the region', () => {
    expect(cleanName('UK| ARC SPORTS 1 FHD').region).toBe('UK');
    expect(cleanName('4K-A+ - Glass Orchard (2024)').region).toBeNull();
  });

  it('keeps mixed-case names as the provider wrote them', () => {
    expect(cleanName('UK| iPlayer Extra').title).toBe('iPlayer Extra');
  });

  it('does not strip a number that is part of the title', () => {
    expect(cleanName('7 Days in May (2019)').title).toBe('7 Days in May');
    expect(cleanName('1917 (2019)')).toMatchObject({ title: '1917', year: 2019 });
  });

  it('falls back to the raw name when cleaning would leave nothing', () => {
    expect(cleanName('4K').title).toBe('4K');
    expect(cleanName('').title).toBe('');
  });
});
