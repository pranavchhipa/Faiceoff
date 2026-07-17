"use client";

/** Mark-paid submit button — confirms before submitting when the creator's
 * bank details changed after this payout was requested. */
export function MarkPaidSubmit({ requireConfirm }: { requireConfirm: boolean }) {
  return (
    <button
      type="submit"
      className="cc-btn"
      style={{
        background: "var(--cc-ok)",
        color: "#06210f",
        borderColor: "var(--cc-ok)",
        fontWeight: 700,
        width: "100%",
      }}
      onClick={(e) => {
        if (
          requireConfirm &&
          !window.confirm(
            "Bank details changed since this payout was requested. Verify with the creator before continuing — mark this paid anyway?",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      ✓ Mark paid
    </button>
  );
}
