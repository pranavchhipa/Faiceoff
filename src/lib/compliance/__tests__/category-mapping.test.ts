import { describe, it, expect } from 'vitest';
import { detectCategories, CATEGORY_KEYWORDS } from '../category-mapping';

describe('detectCategories', () => {
  it('detects alcohol from "wine"', () => {
    expect(detectCategories('a model holding a wine glass')).toContain('alcohol');
  });

  it('detects alcohol from "beer"', () => {
    expect(detectCategories('brand campaign for beer brand')).toContain('alcohol');
  });

  it('detects gun from "ammo"', () => {
    expect(detectCategories('product shoot with ammo boxes')).toContain('gun');
  });

  it('detects gun from "rifle"', () => {
    expect(detectCategories('outdoor scene with rifle in background')).toContain('gun');
  });

  it('detects crypto from "bitcoin"', () => {
    expect(detectCategories('influencer promoting bitcoin wallet app')).toContain('crypto');
  });

  it('detects gambling from "casino"', () => {
    expect(detectCategories('luxurious casino backdrop')).toContain('gambling');
  });

  it('detects tobacco from "cigarette"', () => {
    expect(detectCategories('retro shoot with cigarette prop')).toContain('tobacco');
  });

  it('detects drugs from "cannabis"', () => {
    expect(detectCategories('lifestyle shoot, cannabis leaves in background')).toContain('drugs');
  });

  it('detects adult from "lingerie"', () => {
    expect(detectCategories('lingerie product campaign')).toContain('adult');
  });

  it('detects religious from "temple"', () => {
    expect(detectCategories('shoot in front of a temple at sunrise')).toContain('religious');
  });

  it('detects political from "election"', () => {
    expect(detectCategories('election rally poster campaign')).toContain('political');
  });

  it('returns empty array for neutral brief', () => {
    expect(detectCategories('model wearing a red dress in a coffee shop')).toEqual([]);
  });

  it('does not match "gun" inside "begun"', () => {
    expect(detectCategories('the shoot has begun')).not.toContain('gun');
  });

  it('does not match "bet" inside "better"', () => {
    expect(detectCategories('a better lifestyle campaign')).not.toContain('gambling');
  });

  it('detects multiple categories in one brief', () => {
    const categories = detectCategories('cocktail bar scene with nft promotion');
    expect(categories).toContain('alcohol');
    expect(categories).toContain('crypto');
  });

  it('is case-insensitive', () => {
    expect(detectCategories('WINE TASTING event')).toContain('alcohol');
    expect(detectCategories('Bitcoin investment')).toContain('crypto');
  });

  it('covers all 9 CATEGORY_KEYWORDS entries', () => {
    const allCategories = Object.keys(CATEGORY_KEYWORDS);
    expect(allCategories.sort()).toEqual([
      'adult', 'alcohol', 'crypto', 'drugs', 'gambling',
      'gun', 'political', 'religious', 'tobacco',
    ]);
  });

  it('detects vaping keyword from tobacco category', () => {
    expect(detectCategories('influencer using a vape pen outdoors')).toContain('tobacco');
  });

  it('detects shisha (hookah) from tobacco category', () => {
    expect(detectCategories('cafe scene with shisha in background')).toContain('tobacco');
  });
});
