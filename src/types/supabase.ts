/**
 * Supabase Database types.
 *
 * Generated manually from migration schemas. Run `npx supabase gen types typescript`
 * against your Supabase project to regenerate.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          phone: string | null;
          role: "creator" | "brand" | "admin";
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          phone?: string | null;
          role?: "creator" | "brand" | "admin";
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          phone?: string | null;
          role?: "creator" | "brand" | "admin";
          display_name?: string;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      creators: {
        Row: {
          id: string;
          user_id: string;
          instagram_handle: string | null;
          instagram_followers: number | null;
          bio: string | null;
          kyc_status: "not_started" | "pending" | "approved" | "rejected";
          kyc_document_url: string | null;
          onboarding_step: string;
          is_active: boolean;
          dpdp_consent_version: string | null;
          dpdp_consent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          instagram_handle?: string | null;
          instagram_followers?: number | null;
          bio?: string | null;
          kyc_status?: "not_started" | "pending" | "approved" | "rejected";
          kyc_document_url?: string | null;
          onboarding_step?: string;
          is_active?: boolean;
          dpdp_consent_version?: string | null;
          dpdp_consent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          instagram_handle?: string | null;
          instagram_followers?: number | null;
          bio?: string | null;
          kyc_status?: "not_started" | "pending" | "approved" | "rejected";
          kyc_document_url?: string | null;
          onboarding_step?: string;
          is_active?: boolean;
          dpdp_consent_version?: string | null;
          dpdp_consent_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creators_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      brands: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          gst_number: string | null;
          website_url: string | null;
          industry: string | null;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name: string;
          gst_number?: string | null;
          website_url?: string | null;
          industry?: string | null;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          company_name?: string;
          gst_number?: string | null;
          website_url?: string | null;
          industry?: string | null;
          is_verified?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brands_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      creator_categories: {
        Row: {
          id: string;
          creator_id: string;
          category: string;
          subcategories: string[];
          price_per_generation_paise: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          category: string;
          subcategories?: string[];
          price_per_generation_paise: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          creator_id?: string;
          category?: string;
          subcategories?: string[];
          price_per_generation_paise?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      creator_reference_photos: {
        Row: {
          id: string;
          creator_id: string;
          storage_path: string;
          face_embedding: Json | null;
          is_primary: boolean;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          storage_path: string;
          face_embedding?: Json | null;
          is_primary?: boolean;
          uploaded_at?: string;
        };
        Update: {
          storage_path?: string;
          face_embedding?: Json | null;
          is_primary?: boolean;
        };
        Relationships: [];
      };
      creator_compliance_vectors: {
        Row: {
          id: string;
          creator_id: string;
          blocked_concept: string;
          embedding: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          blocked_concept: string;
          embedding: Json;
          created_at?: string;
        };
        Update: {
          blocked_concept?: string;
          embedding?: Json;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          brand_id: string;
          creator_id: string;
          name: string;
          description: string | null;
          budget_paise: number;
          spent_paise: number;
          generation_count: number;
          max_generations: number;
          status: "active" | "paused" | "completed" | "cancelled";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          creator_id: string;
          name: string;
          description?: string | null;
          budget_paise: number;
          spent_paise?: number;
          generation_count?: number;
          max_generations: number;
          status?: "active" | "paused" | "completed" | "cancelled";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          budget_paise?: number;
          spent_paise?: number;
          generation_count?: number;
          max_generations?: number;
          status?: "active" | "paused" | "completed" | "cancelled";
          updated_at?: string;
        };
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          campaign_id: string;
          brand_id: string;
          creator_id: string;
          structured_brief: Json;
          assembled_prompt: string | null;
          replicate_prediction_id: string | null;
          image_url: string | null;
          delivery_url: string | null;
          status: string;
          compliance_result: Json | null;
          cost_paise: number | null;
          /** FK to licenses (Chunk E per-generation license). */
          license_id: string | null;
          /** R2 URL of license certificate PDF. */
          cert_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          brand_id: string;
          creator_id: string;
          structured_brief: Json;
          assembled_prompt?: string | null;
          replicate_prediction_id?: string | null;
          image_url?: string | null;
          delivery_url?: string | null;
          status?: string;
          compliance_result?: Json | null;
          cost_paise?: number | null;
          license_id?: string | null;
          cert_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          assembled_prompt?: string | null;
          replicate_prediction_id?: string | null;
          image_url?: string | null;
          delivery_url?: string | null;
          status?: string;
          compliance_result?: Json | null;
          cost_paise?: number | null;
          license_id?: string | null;
          cert_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      licenses: {
        Row: {
          id: string;
          generation_id: string;
          brand_id: string;
          creator_id: string;
          scope: "digital" | "digital_print" | "digital_print_packaging";
          is_category_exclusive: boolean;
          exclusive_category: string | null;
          exclusive_until: string | null;
          amount_paid_paise: number;
          creator_share_paise: number;
          platform_share_paise: number;
          issued_at: string;
          expires_at: string;
          auto_renew: boolean;
          renewed_count: number;
          status: "active" | "expired" | "revoked";
          revoked_at: string | null;
          revocation_reason: string | null;
          cert_url: string | null;
          cert_signature_sha256: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          generation_id: string;
          brand_id: string;
          creator_id: string;
          scope: "digital" | "digital_print" | "digital_print_packaging";
          is_category_exclusive?: boolean;
          exclusive_category?: string | null;
          exclusive_until?: string | null;
          amount_paid_paise: number;
          creator_share_paise: number;
          platform_share_paise: number;
          issued_at?: string;
          expires_at: string;
          auto_renew?: boolean;
          renewed_count?: number;
          status?: "active" | "expired" | "revoked";
          revoked_at?: string | null;
          revocation_reason?: string | null;
          cert_url?: string | null;
          cert_signature_sha256?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          scope?: "digital" | "digital_print" | "digital_print_packaging";
          is_category_exclusive?: boolean;
          exclusive_category?: string | null;
          exclusive_until?: string | null;
          expires_at?: string;
          auto_renew?: boolean;
          renewed_count?: number;
          status?: "active" | "expired" | "revoked";
          revoked_at?: string | null;
          revocation_reason?: string | null;
          cert_url?: string | null;
          cert_signature_sha256?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "licenses_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: true;
            referencedRelation: "generations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "licenses_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "licenses_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creators";
            referencedColumns: ["id"];
          }
        ];
      };
      approvals: {
        Row: {
          id: string;
          generation_id: string;
          creator_id: string;
          brand_id: string;
          status: string;
          feedback: string | null;
          decided_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          generation_id: string;
          creator_id: string;
          brand_id: string;
          status?: string;
          feedback?: string | null;
          decided_at?: string | null;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          status?: string;
          feedback?: string | null;
          decided_at?: string | null;
        };
        Relationships: [];
      };
      wallet_transactions: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          amount_paise: number;
          direction: "credit" | "debit";
          reference_id: string | null;
          reference_type: string | null;
          balance_after_paise: number;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          amount_paise: number;
          direction: "credit" | "debit";
          reference_id?: string | null;
          reference_type?: string | null;
          balance_after_paise: number;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          description?: string | null;
        };
        Relationships: [];
      };
      disputes: {
        Row: {
          id: string;
          generation_id: string;
          raised_by: string;
          reason: string;
          status: string;
          resolution_notes: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          generation_id: string;
          raised_by: string;
          reason: string;
          status?: string;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          resolution_notes?: string | null;
          resolved_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_type: "user" | "system" | "admin";
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          metadata: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          actor_type: "user" | "system" | "admin";
          action: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_campaign_with_escrow: {
        Args: {
          p_brand_id: string;
          p_user_id: string;
          p_creator_id: string;
          p_name: string;
          p_description: string;
          p_budget_paise: number;
          p_max_generations: number;
          p_price_per_generation_paise: number;
          p_structured_brief: Json;
        };
        Returns: {
          campaign_id: string;
          generation_ids: string[];
          balance_after_paise: number;
        };
      };
    };
    Enums: Record<string, never>;
  };
};
