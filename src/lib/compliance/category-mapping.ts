/**
 * Category keyword mapping for Faiceoff compliance checks.
 * Maps brief text keywords to content restriction categories.
 */

/** All content restriction categories supported by creator_blocked_categories. */
export type Category =
  | 'alcohol'
  | 'tobacco'
  | 'gambling'
  | 'political'
  | 'religious'
  | 'adult'
  | 'gun'
  | 'crypto'
  | 'drugs';

/** Keywords that trigger each category. All lowercase; matching uses whole-word boundaries. */
export const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  alcohol: [
    'wine', 'beer', 'whiskey', 'vodka', 'rum', 'cocktail',
    'spirits', 'alcohol', 'liquor', 'champagne', 'tequila',
    'brandy', 'gin', 'sake', 'mead', 'cider', 'brew', 'brewery',
  ],
  tobacco: [
    'cigarette', 'tobacco', 'smoking', 'vape', 'vaping',
    'cigar', 'hookah', 'shisha', 'nicotine', 'chewing tobacco',
  ],
  gambling: [
    'casino', 'poker', 'betting', 'gambling', 'slot machine',
    'lottery', 'dice', 'roulette', 'wager', 'bet', 'jackpot', 'odds',
  ],
  political: [
    'election', 'political', 'politician', 'party', 'vote',
    'campaign', 'rally', 'flag', 'nationalist', 'ballot',
    'president', 'prime minister', 'parliament', 'congress',
  ],
  religious: [
    'hindu', 'muslim', 'christian', 'sikh', 'jain', 'buddhist',
    'temple', 'mosque', 'church', 'god', 'religion', 'prayer',
    'worship', 'bible', 'quran', 'gita', 'priest', 'pastor', 'imam',
  ],
  adult: [
    'nude', 'sexy', 'adult', 'xxx', 'porn', 'erotic',
    'sexual', 'intimate', 'lingerie', 'explicit', 'nsfw',
  ],
  gun: [
    'gun', 'rifle', 'pistol', 'firearm', 'weapon', 'ammo',
    'bullet', 'shooting', 'combat', 'revolver', 'shotgun', 'carbine',
    'sniper', 'grenade', 'missile',
  ],
  crypto: [
    'crypto', 'bitcoin', 'ethereum', 'nft', 'blockchain',
    'wallet', 'token', 'dao', 'defi', 'altcoin', 'staking',
    'mining', 'web3', 'solana', 'binance',
  ],
  drugs: [
    'drug', 'marijuana', 'weed', 'cannabis', 'cocaine',
    'heroin', 'meth', 'pill', 'narcotic', 'ecstasy', 'lsd',
    'psychedelic', 'opium', 'crack', 'amphetamine',
  ],
};

/**
 * Detect which content categories are present in a brief string.
 * Uses whole-word boundary matching to avoid false positives
 * (e.g. "gun" in "begun" should not trigger).
 *
 * @param brief - The generation brief text (product + scene + mood + etc. concatenated)
 * @returns Array of detected categories (may be empty)
 */
export function detectCategories(brief: string): Category[] {
  const matched = new Set<Category>();

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[Category, string[]]>) {
    for (const kw of keywords) {
      // Escape special regex chars in keyword (e.g. "slot machine" has a space, not a special char here)
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (re.test(brief)) {
        matched.add(cat);
        break; // One match per category is enough
      }
    }
  }

  return [...matched];
}
