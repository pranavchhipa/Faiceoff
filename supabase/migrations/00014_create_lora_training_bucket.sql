-- Create the `lora-training` storage bucket used to stage zips of
-- reference photos before sending them to Replicate's LoRA trainer.
--
-- Private bucket (no public reads). Access is only via short-lived
-- signed URLs generated server-side with the service role key.
--
-- Runtime `listBuckets/createBucket` calls from the admin client have been
-- unreliable (returning "Bucket not found" even after createBucket succeeds).
-- Declaring the bucket here makes it idempotent and deterministic.

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'lora-training',
  'lora-training',
  false,
  524288000 -- 500 MB
)
on conflict (id) do nothing;

-- No storage.objects RLS policies needed — all reads/writes happen
-- server-side with the service role key which bypasses RLS.
