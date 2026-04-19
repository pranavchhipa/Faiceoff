-- Add gender column to creators so the generation pipeline can render the
-- subject with the correct pronouns / visible gender. Without this, the
-- prompt assembler emits "A candid photograph of a person" and Nano Banana
-- Pro frequently defaults to a female hallucination regardless of the face
-- reference pack.

alter table public.creators
  add column if not exists gender text
    check (gender in ('male', 'female', 'non_binary', 'prefer_not_to_say'));

comment on column public.creators.gender is
  'Subject gender used in prompt assembly. Collected in onboarding identity step.';
