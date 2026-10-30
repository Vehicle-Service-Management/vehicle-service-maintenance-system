# Vehicle Service Management Test Execution Log

This file tracks the supplied functional test cases one at a time. It records the build under test, observed results, defects, and proposed changes. A case is marked failed only when its expected result is not met; incomplete checks are marked partial.

## Test run details

- Test plan: `Test_Plan_and_test_cases (2).docx` (40 functional cases)
- Repository baseline: `main` at `3b4c51f`
- Environment: local Windows development setup; API at `http://localhost:3000`, client at `http://127.0.0.1:5173`
- Database: fresh local SQLite database

## Execution summary

| Case | Result | Defect |
| --- | --- | --- |
| UT-01 | Passed | None |
| UT-02 | Passed | None |

## Case results

### UT-01 — Valid user authentication

- **Expected:** A registered active user can sign in with valid credentials.
- **Setup:** Created `staff01@example.com` as an active Service Advisor test account, matching the test plan's `staff01` sample.
- **Observed:** The local client returned HTTP 200. A valid login request to `POST /api/auth/login` returned an access token and the `Service Advisor` role. The tester confirmed that the same credentials work in the browser.
- **Result:** **Passed.**
- **Defect:** None confirmed.
- **Change proposed:** None at this time. Complete the browser login step when interactive UI access is available; investigate only if it fails.
- **Tester confirmation:** The tester reported that the valid credentials work in the browser.

### UT-02 — Reject invalid credentials

- **Expected:** An invalid username/password combination is rejected with an appropriate failure message.
- **Setup:** Used the active `staff01@example.com` account with an incorrect password (`Wrong@123`).
- **Observed:** `POST /api/auth/login` returned HTTP 401 and did not return an access token.
- **Observed in browser:** The website displayed an invalid-password message and did not sign in the user, as reported by the tester.
- **Result:** **Passed.**
- **Defect:** None confirmed.
- **Change proposed:** None at this time. If the browser shows a success state or fails to show a clear login error, record that as a defect for investigation.
- **Tester confirmation:** The invalid-password message appeared in the browser.

## Failure and change register

No functional failures have been confirmed so far. Add an entry here only when a case fails, with the failing steps, evidence, likely cause, and proposed code or configuration change.
