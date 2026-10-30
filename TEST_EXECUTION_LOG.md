# Vehicle Service Management Test Execution Log

This file tracks the supplied functional test cases one at a time. It records the build under test, observed results, defects, and proposed changes. A case is marked failed only when its expected result is not met; incomplete checks are marked partial.

## Test run details

- Test plan: `Test_Plan_and_test_cases (2).docx` (40 functional cases)
- Repository baseline: UT-01 and UT-02 ran on `main` at `3b4c51f`; UT-03 and later cases use updated `main` code at `bc19591`.
- Environment: local Windows development setup; API at `http://localhost:3000`, client at `http://127.0.0.1:5173`
- Database: fresh local SQLite database

## Execution summary

| Case | Result | Defect |
| --- | --- | --- |
| UT-01 | Passed | None |
| UT-02 | Passed | None |
| UT-03 | Passed | None |
| IT-01 | Passed | Initial UI attempt hit a stale backend build; cleared after rebuilding and refreshing |
| IT-02 | Passed | None |

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

### UT-03 - Prevent submission with blank credentials

- **Expected:** The login form blocks submission when required credentials are blank and shows a validation warning.
- **Setup:** Loaded the login page on the current `main` build (`bc19591`) and left both credential fields empty.
- **Observed in browser:** The tester reported that the browser showed a required-field warning when **Sign in** was clicked; sign-in was blocked.
- **Result:** **Passed.**
- **Defect:** None.
- **Change proposed:** None.
- **Tester confirmation:** The browser displayed the required-field warning.

### IT-01 - Apply role-based access for a Service Technician

- **Expected:** A Service Technician signs in, sees the technician workspace, and can access assigned work.
- **Setup:** Created the active `tech01@example.com` Service Technician test account.
- **Observed in browser:** The Technician Workspace and Assigned service work page appeared, but the page showed `Insufficient permissions`.
- **Investigation:** The browser was calling a backend built from the earlier `3b4c51f` source, which did not match the updated frontend. Rebuilt and restarted the API from current `main` code at `bc19591`.
- **API retest:** Login identified the account as `Service Technician`; `GET /api/services/assigned?limit=100` returned HTTP 200 with zero assigned requests.
- **Browser retest:** After the backend rebuild, the tester refreshed the workspace and confirmed the permission error cleared; the empty assigned-work state appeared.
- **Result:** **Passed.**
- **Defect:** None. The first error came from a stale local backend build.
- **Change proposed:** No application code change. Keep the API build aligned with current `main` before testing.
- **Retest:** Passed after rebuilding the backend and refreshing the browser.

### IT-02 - Deny Customer access to administrator functions

- **Expected:** A Customer account is denied access to administrator-only functions and receives no protected user data.
- **Setup:** Created an active Customer account linked to the local test customer `customer-it02@example.com`.
- **Test action:** Signed in as that Customer and requested `GET /api/admin/users?limit=10`.
- **Observed:** The API returned HTTP 403 and no user list.
- **Result:** **Passed.**
- **Defect:** None.
- **Change proposed:** None; the endpoint denied access as expected.

## Failure and change register

No functional failures have been confirmed so far. Add an entry here only when a case fails, with the failing steps, evidence, likely cause, and proposed code or configuration change.
