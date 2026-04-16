# Promotional Credits — Required Legal Disclosures

**Status:** Ready to paste into the in-app Terms of Use and Privacy Policy screens whenever you want. I did NOT modify the screens per your "no UI changes" instruction.

**Why you need to add this before App Store submission:** Apple requires accurate disclosure of how user identifiers are used in affiliate URLs and how promotional credits work. Without this, the feature is technically non-compliant even though it's invisible.

---

## 1. Add to Terms of Use

Add as a new section (suggested placement: between "Subscriptions" and "User Conduct", or at the end before "Disclaimers").

### Promotional Credits

HomeGenie may grant promotional wishes ("Promotional Credits") to your account from time to time at our sole discretion. Promotional Credits may be awarded based on account activity, app usage, affiliate partnerships, referrals, milestones, or other qualifying criteria we determine.

Promotional Credits:

- Have no cash value and cannot be exchanged for money or refunded.
- Are non-transferable between accounts.
- May expire, be reduced, or be revoked at our discretion, including for account inactivity, violation of these Terms, suspected fraud, or termination of your account.
- Are separate from, and do not replace, any in-app purchases (subscriptions or wish packs) you may make through the Apple App Store.
- Are not sold to you. They are a promotional benefit we provide at no cost.

To administer Promotional Credits, we may associate your account with an anonymous identifier that we append to certain outbound affiliate links. This identifier allows us to attribute qualifying activity to your account without sharing your personal information with third-party retailers. By using HomeGenie, you consent to this activity for the sole purpose of administering Promotional Credits.

Nothing in this section obligates us to grant any Promotional Credits, and we may discontinue the program at any time without notice.

---

## 2. Add to Privacy Policy

Add one sentence in the section that describes how you collect and use information (typically titled "How We Collect Information" or "Information We Collect").

### Suggested wording (one sentence)

When you tap certain affiliate product links in HomeGenie, we may append an anonymous identifier tied to your account to the destination URL. This enables us to attribute promotional credits to your account when a qualifying purchase occurs. No personally identifiable information is shared with third-party retailers through this mechanism.

---

## 3. App Store Submission Notes

When you submit the update, in App Review Information → Notes, add:

> This update includes backend infrastructure to grant promotional wish credits to users based on affiliate partnerships. Promotional credits are granted silently at HomeGenie's discretion and are disclosed in the Terms of Use. No user-facing UI advertises or discusses this feature. All in-app purchases continue to use Apple's In-App Purchase system.

This preempts any confusion from a reviewer who notices the affiliate URL tagging in network traffic.

---

## 4. Changes to Data Handling

For the record — what the feature actually does with user data:

| Data Element | Where Stored | Shared With Third Parties? |
|---|---|---|
| User ID (first 8 chars of UUID) | Appended to Amazon affiliate URLs at tap time | Yes — appears in Amazon Associates reports. No PII (just an opaque identifier). |
| Click event (user_id, product_id, ASIN, subtag, timestamp) | `affiliate_clicks` table | No |
| Confirmed order (network, order_ref, commission) | `affiliate_orders` table | No |
| Wish grant transaction | `token_transactions` ledger | No |

No email, name, device ID, or other PII is ever sent to Amazon through the affiliate URL.
