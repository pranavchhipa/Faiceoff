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
      creator_lora_models: {
        Row: {
          id: string;
          creator_id: string;
          replicate_model_id: string | null;
          replicate_training_id: string | null;
          training_status: "queued" | "training" | "completed" | "failed";
          training_started_at: string | null;
          training_completed_at: string | null;
          training_zip_url: string | null;
          training_error: string | null;
          trigger_word: string;
          sample_images: string[];
          creator_approved: boolean;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          replicate_model_id?: string | null;
          replicate_training_id?: string | null;
          training_status?: "queued" | "training" | "completed" | "failed";
          training_started_at?: string | null;
          training_completed_at?: string | null;
          training_zip_url?: string | null;
          training_error?: string | null;
          trigger_word?: string;
          sample_images?: string[];
          creator_approved?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          replicate_model_id?: string | null;
          replicate_training_id?: string | null;
          training_status?: "queued" | "training" | "completed" | "failed";
          training_started_at?: string | null;
          training_completed_at?: string | null;
          training_zip_url?: string | null;
          training_error?: string | null;
          trigger_word?: string;
          sample_images?: string[];
          creator_approved?: boolean;
          version?: number;
          updated_at?: string;
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
          updated_at?: string;
        };
        Relationships: [];
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
