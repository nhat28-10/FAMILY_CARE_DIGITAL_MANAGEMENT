# GET /admin/revenue/monthly response schema

Returns monthly paid subscription revenue grouped by UTC `payment_transactions.createdAt`.

Revenue fields are money amounts from `SUM(payment_transactions.amount)`. They are not transaction counts. Transaction count is exposed only as `paidCount`.

```json
[
  {
    "month": "2026-07",
    "totalRevenue": 5540000,
    "monthlyRevenue": 0,
    "yearlyRevenue": 5540000,
    "paidCount": 4,
    "currency": "vnd"
  }
]
```

Fields:

- `month`: Month bucket in `YYYY-MM` format.
- `totalRevenue`: Sum of `amount` for PAID payment rows in the month.
- `monthlyRevenue`: Sum of `amount` for PAID rows resolved to `planCode = MONTHLY`.
- `yearlyRevenue`: Sum of `amount` for PAID rows resolved to `planCode = YEARLY`.
- `paidCount`: Number of PAID payment rows included in the month bucket.
- `currency`: Currency code for the bucket, defaulting to `vnd`.

PAID rows are identified by `type = invoice.paid` or case-insensitive `status = PAID`, matching the admin payment list behavior. Plan code resolution prefers `rawPayload.planCode`, then Stripe price id mapping, then the current family subscription plan as fallback.
