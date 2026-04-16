-- Add LoRA training tracking fields
-- trigger_word: the unique word that activates this creator's face in a prompt
-- replicate_training_id: Replicate's training job ID, used for status polling/webhook matching

alter table public.creator_lora_models
  add column if not exists trigger_word text not null default 'TOK',
  add column if not exists replicate_training_id text,
  add column if not exists training_zip_url text,
  add column if not exists training_error text;

create index if not exists idx_lora_models_training_id
  on public.creator_lora_models(replicate_training_id);
