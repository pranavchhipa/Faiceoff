export type UserRole = 'creator' | 'brand' | 'admin'
export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected'
export type OnboardingStep =
  | 'identity'
  | 'instagram'
  | 'categories'
  | 'compliance'
  | 'consent'
  | 'photos'
  | 'lora_review'
  | 'pricing'
  | 'complete'

export interface User {
  id: string
  email: string
  phone: string | null
  role: UserRole
  display_name: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Creator {
  id: string
  user_id: string
  instagram_handle: string | null
  instagram_followers: number | null
  bio: string | null
  kyc_status: KycStatus
  kyc_document_url: string | null // encrypted, 90-day retention
  onboarding_step: OnboardingStep
  is_active: boolean
  dpdp_consent_version: string | null
  dpdp_consent_at: string | null
  created_at: string
  updated_at: string
}

export interface Brand {
  id: string
  user_id: string
  company_name: string
  gst_number: string | null
  website_url: string | null
  industry: string | null
  is_verified: boolean
  created_at: string
  updated_at: string
}
