"use client";

interface StubCategory {
  id: string;
  category: string;
  price_per_generation_paise: number;
}
interface StubCreator {
  id: string;
  display_name: string;
  hero_photo_url: string | null;
  avatar_url: string | null;
  categories: StubCategory[];
}
interface Props {
  creator: StubCreator;
  minPrice: number | null;
  onClose: () => void;
}

export function StartCampaignSheet(_props: Props) {
  return null;
}
