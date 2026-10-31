# Vehicle Service Management Test Execution Log

## Run 1

- Test plan: `Test_Plan_and_test_cases (2).docx` (40 functional cases)
- Build under test: `main` at `162a252`
- Date: 2026-10-31 (Asia/Calcutta)
- Environment: Windows local checkout; API at `http://localhost:3000`; isolated SQLite database `data/test-run-20261031.sqlite`
- Note: Browser automation was unavailable in this session. UI observations are recorded from tester confirmations where provided; otherwise UI steps remain pending.

## Execution summary

| Case | Result | Defect / note |
| --- | --- | --- |
| UT-01 | Passed | API login passed; tester confirmed browser login worked |
| UT-02 | Partial | API returned HTTP 401; tester completed browser check, but did not report the displayed outcome |
| UT-03 | Passed | API returned HTTP 400; tester confirmed blank form submission was blocked with validation feedback |
| IT-01 | Passed | API access passed; screenshot shows Technician Workspace and assigned General Service request |
| IT-02 | Passed | Customer could not access User management in browser; admin API returned HTTP 403 |
| IT-03 | Partial | Expired-token API request returned HTTP 401; browser session clearing still needs confirmation |
| ST-01 | Partial | Service Advisor login returned the correct role and Customers API returned HTTP 200; browser check pending |
| ST-02 | Not run | — |
| UT-04 | Not run | — |
| UT-05 | Not run | — |
| UT-06 | Not run | — |
| IT-04 | Not run | — |
| IT-05 | Not run | — |
| IT-06 | Not run | — |
| ST-03 | Not run | — |
| ST-04 | Not run | — |
| UT-07 | Not run | — |
| UT-08 | Not run | — |
| UT-09 | Not run | — |
| IT-07 | Not run | — |
| IT-08 | Not run | — |
| IT-09 | Not run | — |
| ST-05 | Not run | — |
| ST-06 | Not run | — |
| UT-10 | Not run | — |
| UT-11 | Not run | — |
| UT-12 | Not run | — |
| IT-10 | Not run | — |
| IT-11 | Not run | — |
| IT-12 | Not run | — |
| ST-07 | Not run | — |
| ST-08 | Not run | — |
| UT-13 | Not run | — |
| UT-14 | Not run | — |
| UT-15 | Not run | — |
| IT-13 | Not run | — |
| IT-14 | Not run | — |
| IT-15 | Not run | — |
| ST-09 | Not run | — |
| ST-10 | Not run | — |

## Case details

### UT-01 — Valid user authentication

- **Expected:** A registered user can authenticate with valid credentials.
- **Setup:** In the isolated test database, created `staff01@example.com` as an active Service Advisor. The plan's sample `staff01@123` is not an email address, while the current login API requires an email; used a valid email-format test account instead.
- **Observed:** `POST /api/auth/login` returned HTTP 200, a bearer token, and role `Service Advisor`.
- **Observed in browser:** The tester confirmed the sign-in worked.
- **Result:** **Passed.** API authentication returned HTTP 200 with the Service Advisor role and a bearer token; browser sign-in was confirmed by the tester.
- **Defect:** None confirmed.

### UT-02 — Reject invalid credentials

- **Expected:** Invalid credentials are rejected with a failure message.
- **Test action:** Submitted `staff01@example.com` with an incorrect password to `POST /api/auth/login`.
- **Observed:** HTTP 401; the API response indicates `Invalid email or password`.
- **Browser step:** The tester confirmed completing the browser check; the displayed outcome has not been reported.
- **Result:** **Partial.** API rejection passed. Awaiting the browser result before marking the case passed or failed.
- **Defect:** None confirmed.

### UT-03 — Prevent submission with blank credentials

- **Expected:** The login form blocks blank credentials and shows validation feedback.
- **Test action:** Submitted blank email and password to `POST /api/auth/login`.
- **Observed:** The API returned HTTP 400.
- **Observed in browser:** The tester confirmed the blank submission was blocked and validation feedback appeared.
- **Result:** **Passed.** The API returned HTTP 400, and the tester confirmed the browser form blocked submission with validation feedback.
- **Defect:** None confirmed.


### IT-01 — Apply role-based access for a Service Technician

- **Expected:** A Service Technician signs in, sees the technician workspace, and can access assigned work.
- **Setup:** Created `tech01@example.com` as an active Service Technician. Created customer `IT01 Test Customer`, vehicle `KA01IT001`, and a validated service request assigned to this technician in the isolated database.
- **Observed:** Technician login returned the `Service Technician` role. `GET /api/services/assigned?limit=100` returned HTTP 200 with one assigned request (`KA01IT001`, status `assigned`).
- **Observed in browser:** Tester screenshot shows the Technician Workspace, Assigned service work page, and the assigned General Service request with status `Assigned`.
- **Result:** **Passed.** The technician role and assigned work are accessible in the API and browser.
- **Defect:** None confirmed.

### IT-02 — Deny Customer access to administrator functions

- **Expected:** A Customer is denied access to administrator-only functions and receives no protected user data.
- **Setup:** Linked `it01-customer@example.com` to the IT-01 customer record and signed in as Customer.
- **Test action:** Requested `GET /api/admin/users?limit=10` with the Customer bearer token.
- **Observed:** HTTP 403; no user list was returned.
- **Observed in browser:** The tester confirmed User management was hidden for the Customer account.
- **Result:** **Passed.** User management was hidden in the browser and the admin API returned HTTP 403 with no user list.
- **Defect:** None confirmed.

### IT-03 — Reject requests from an expired session

- **Expected:** A protected request with an expired session is blocked and the user must authenticate again.
- **Setup:** Signed in as `tech01@example.com`; generated an expired bearer token for the active technician account.
- **Test action:** Requested `GET /api/services/assigned?limit=100` with the expired bearer token.
- **Observed:** HTTP 401 with `Invalid or expired access token`; no protected work data was returned.
- **Client handling:** The current API client invokes the unauthorized handler on HTTP 401, and `SessionContext` connects it to `clearSession`, which returns the app to sign-in.
- **Result:** **Partial.** API rejection passed and client handling is present in code; browser session transition was not observed in this run.
- **Defect:** None confirmed.


### ST-01 - Complete valid sign-in and role-based access flow

- **Expected:** A valid service staff user signs in, is identified with the correct role, and can open a function allowed for that role.
- **Setup:** Used the active Service Advisor account `staff01@example.com`.
- **Observed:** Login returned role `Service Advisor`; `GET /api/customers?limit=10` returned HTTP 200 with the permitted customer list.
- **Result:** **Partial.** API authentication and role-authorized access passed. Browser role display and Customers page confirmation remain pending.
- **Defect:** None confirmed.
## Automated baseline checks

- `npm.cmd test`: **25 passed, 0 failed**.
- `npm.cmd run typecheck`: **passed**.
- `npm.cmd run typecheck:client`: **passed**.
- `npm.cmd --prefix client run build`: **passed**.
- These checks establish the current code baseline; they do not replace execution of the 40 manual cases above.

## Failure and change register

No application failure has been confirmed. UT-02 browser outcome and IT-03 browser session expiry remain unverified. ST-01 browser confirmation is pending.
