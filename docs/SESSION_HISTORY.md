# Till Session History

Session history is a reconciliation view, not a generic cash-movement table. The management API derives cash sales, cash in, cash refunds, safe drops, historical cash out/payouts, and expected cash from persisted session movements, while counted cash, variance, disposition, timestamps, and opened/closed actors come from `app.cashier_session`.

Admin and Head Office views remain scoped to the selected management branch/location. Selecting a till adds that till to the session-history query key and filter. Closed sessions remain available for review; a carry-forward with no physical transfer does not receive a fabricated GL journal.
# Phase 8Q consistency

Cashier `My Till` now uses the same `SessionHistory` summary contract as central management, filtered by the authenticated cashier and operating branch/location. Current-session movement activity remains separately labelled from historical session reconciliation. View Session loads only the selected cashier's authorized detail.

Central opening feedback is emitted only from the committed API success response and includes session number, selected cashier, till, and location. Backend failure messages remain visible and the post-success refresh invalidates register, active-session, history, candidates, assignments, and detail queries.
