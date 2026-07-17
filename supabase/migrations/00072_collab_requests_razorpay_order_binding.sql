-- Security fix: bind the Razorpay order to the specific collab_requests row
-- it was created for.
--
-- Previously confirm-payment only verified that a (order_id, payment_id,
-- signature) triple was a GENUINE Razorpay-issued signature
-- (HMAC(order_id|payment_id, secret) == signature). That proves authenticity
-- but not that this order/payment was actually created for THIS collab
-- request — a brand could replay a valid signature from any other real
-- payment of theirs (e.g. a cheap wallet top-up) against an expensive collab
-- request and unlock it without paying the real amount, since the order was
-- never checked against what start-payment actually created.
--
-- Fix: start-payment now stores the order id it creates here; confirm-payment
-- (and the webhook) reject any signature whose order_id doesn't match.

alter table public.collab_requests
  add column if not exists razorpay_order_id text;

create index if not exists idx_collab_requests_razorpay_order
  on public.collab_requests(razorpay_order_id)
  where razorpay_order_id is not null;

comment on column public.collab_requests.razorpay_order_id is
  'Razorpay order id created by start-payment for this request. confirm-payment and the webhook must verify the presented order_id matches this value before granting credits — prevents replaying a signature from an unrelated payment.';
