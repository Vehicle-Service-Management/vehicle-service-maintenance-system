# Vehicle Service Management Test Execution Log

## Run 1

- Test plan: `Test_Plan_and_test_cases (2).docx` (40 functional cases)
- Build under test: `main` at `162a252`
- Date: 2026-10-31 (Asia/Calcutta)
- Environment: Windows local checkout; API at `http://localhost:3000`; isolated SQLite database `data/test-run-20261031.sqlite`
- Note: Browser automation was unavailable in this session. UI observations are recorded from tester confirmations where provided; otherwise UI steps remain pending.

## Latest result across runs

This table reflects the latest recorded result for each case. Per-run notes below retain the build and evidence for each execution.

| Case | Result | Defect / note |
| --- | --- | --- |
| UT-01 | Passed | API login passed; tester confirmed browser login worked |
| UT-02 | Passed | Invalid credentials were rejected in the ST-02 browser flow; API returned HTTP 401 |
| UT-03 | Passed | API returned HTTP 400; tester confirmed blank form submission was blocked with validation feedback |
| IT-01 | Passed | API access passed; screenshot shows Technician Workspace and assigned General Service request |
| IT-02 | Passed | Customer could not access User management in browser; admin API returned HTTP 403 |
| IT-03 | Passed | Expired session was rejected by the API and confirmed in the ST-02 browser flow |
| ST-01 | Passed | Service Advisor role and authorized Customers access confirmed in the browser |
| ST-02 | Passed | Combined invalid-login, Customer authorization, and expired-session flow confirmed |
| UT-04 | Passed | Customer was created and displayed correctly in the browser |
| UT-05 | Passed | Blank customer name triggered required-field validation; submission stayed blocked |
| UT-06 | Passed | Service Advisor registered a Honda City; vehicle appeared under the selected customer |
| IT-04 | Passed | Advisor could view customer/vehicle records; Technician and Customer access was denied (403) |
| IT-05 | Passed | Invalid phone/year rejected; valid phone and vehicle model updates persisted and displayed on reread |
| IT-06 | Passed | Vehicle retained its customer association after a valid vehicle update |
| ST-03 | Passed | Customer and vehicle created, viewed, updated, and reopened with changes persisted |
| ST-04 | Passed | Customer-role updates were denied (403); stored customer and vehicle values remained unchanged |
| UT-07 | Failed | Request was created (201), but the submitted service date was not stored or returned |
| UT-08 | Failed | Blank vehicle was rejected (400), but a valid vehicle with blank request date was accepted (201) |
| UT-09 | Passed | Technician viewed assigned work and recorded work performed and notes |
| IT-07 | Passed | Retrieved service request retained the correct vehicle and customer association |
| IT-08 | Passed | Assigned request appeared in the selected technician's assigned-work list |
| IT-09 | Passed | Brake inspection activity stayed on its original request; unrelated request remained unchanged |
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
- **Run 1 browser step:** The tester reported completing the check but did not provide the displayed outcome.
- **Run 2 confirmation:** The ST-02 browser flow confirmed invalid Customer credentials are rejected.
- **Result:** **Passed.** Invalid credentials were rejected by the API and the browser flow.
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
- **Run 2 confirmation:** The tester passed the ST-02 combined browser flow, which includes invalid-session protection and return to authentication.
- **Result:** **Passed.** The expired token returned HTTP 401, and the tester confirmed the combined expired-session flow.
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

No application failure has been confirmed. UT-02 and IT-03 passed using the combined ST-02 evidence; separate retests for those individual cases were not recorded. Other planned cases remain pending.

## Run 2 - Retest on latest main
### Run 2 case summary

| Case | Result | Note |
| --- | --- | --- |
| ST-01 | Passed | Browser role and authorized Customers access confirmed |
| ST-02 | Passed | Tester confirmed the combined authentication and access-control flow |

- Build under test: `main` at `5311f11` (`feat: add CI workflow for testing and building API and client`)
- Environment: API at `http://localhost:3000`; client at `http://localhost:5173`; isolated database `data/test-run-20261031.sqlite`
- Code delta since Run 1: latest commit adds CI workflow only; application source files are unchanged.
- **API observation:** `staff01@example.com` authenticated as `Service Advisor`; `GET /api/customers?limit=10` returned HTTP 200 with 1 customer.
- **Browser observation:** The tester confirmed the Service Advisor role and reported ST-01 passed, including authorized Customers access.
- **Result:** **Passed.** The Service Advisor role was identified, and the tester confirmed the complete sign-in and authorized-access flow.

## Run 2 - ST-02 retest

- Build under test: `main` at `5311f11` (application source unchanged by this commit)
- Test actions: invalid Customer password; valid Customer request to the admin users API; expired Customer token request to `/api/me/vehicles`.
- **Observed:** Invalid login returned HTTP 401; Customer access to `/api/admin/users` returned HTTP 403; expired token access to `/api/me/vehicles` returned HTTP 401.
- **Browser observation:** The tester reported completing the combined flow successfully.
- **Result:** **Passed.** Invalid login was rejected, Customer access to admin functions was denied, and the expired session could not access protected data.

### UT-04 - Register a customer

- **Expected:** Authorized service staff can register a customer with valid information.
- **Setup:** Signed in as the Service Advisor account `staff01@example.com`.
- **Test data:** Rahul Kumar; phone `9876543210`; email `rahul@example.com`; address Bengaluru.
- **Observed in browser:** The tester confirmed the customer was added and displayed correctly.
- **Result:** **Passed.**
- **Defect:** None confirmed.

### UT-05 - Validate required customer information

- **Expected:** The form prevents saving when a required customer field is blank and displays validation feedback.
- **Test action:** Left Customer name blank and submitted the customer form.
- **Observed in browser:** Required-field feedback appeared for Customer name, and the form remained open without a creation confirmation.
- **Result:** **Passed.**
- **Defect:** None confirmed.

### UT-06 - Register a vehicle for a customer

- **Expected:** Authorized staff can register a vehicle and associate it with the selected customer.
- **Setup:** Built the current branch successfully and used an isolated in-memory SQLite database with a Service Advisor account.
- **Test data:** Customer `UT-06 Customer`; registration `KA01AB1234`; Honda City; year 2022.
- **Test action:** Created the customer through the API as the Service Advisor, then submitted the vehicle registration.
- **Observed:** Customer creation returned HTTP 201; vehicle registration returned HTTP 201 with the expected customer ID, registration number, make, model, and year. Listing the customer's vehicles returned HTTP 200 with the new vehicle.
- **Result:** **Passed.** The vehicle was created and linked to the selected customer.
- **Defect:** None observed in this API flow. Browser UI behavior was not tested.

### IT-04 - Restrict customer and vehicle records by role

- **Expected:** Users can view only customer and vehicle records permitted for their role.
- **Setup:** Built the current branch successfully and used an isolated in-memory SQLite database with Service Advisor, Service Technician, and Customer accounts, plus a linked customer and vehicle.
- **Test actions:** Requested customer list/detail and vehicle list/detail endpoints as each role.
- **Observed:** The Service Advisor received HTTP 200 for all four requests and could see the seeded records. The Service Technician and Customer each received HTTP 403 for all four requests; the denied responses did not expose the seeded vehicle registration.
- **Result:** **Passed.** Customer and vehicle access was limited to the authorized Service Advisor role in the API. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### IT-05 - Validate and persist customer and vehicle updates

- **Expected:** Valid customer and vehicle updates are checked, saved, and displayed when the records are reopened.
- **Setup:** Built the current branch successfully and used an isolated in-memory SQLite database with a Service Advisor account, customer, and vehicle.
- **Test actions:** Tried an invalid short customer phone and invalid future vehicle year, then changed the customer phone to `9876500000` and vehicle model to `City ZX`; fetched both records again.
- **Observed:** The invalid phone and year returned HTTP 400. Both valid updates returned HTTP 200. Reopening the records returned the updated phone and model.
- **Result:** **Passed.** Invalid data was rejected and valid customer/vehicle updates persisted. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### IT-06 - Preserve vehicle customer association after update

- **Expected:** A vehicle remains associated with the correct customer after registration and subsequent updates.
- **Setup:** Built the current branch successfully and used an isolated in-memory SQLite database with a Service Advisor account.
- **Test actions:** Registered customer Rahul Kumar and vehicle `KA01AB1234`, updated the vehicle model to `City ZX`, then retrieved the vehicle.
- **Observed:** Creation and update requests succeeded. The retrieved vehicle retained the original customer ID and registration number and showed the updated model.
- **Result:** **Passed.** The customer association remained intact after the vehicle update. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### ST-03 - Complete customer and vehicle workflow

- **Expected:** Valid customer and vehicle records can be created, viewed, updated, and reopened with correct association.
- **Setup:** Built the current branch successfully and used an isolated in-memory SQLite database with a Service Advisor account.
- **Test actions:** Created Rahul Kumar and vehicle `KA01ST0303`, viewed both records, changed the customer phone to `9876500000` and vehicle model to `City ZX`, then fetched both records again.
- **Observed:** Create, view, and update requests succeeded. Reopened records showed the updated phone and model, and the vehicle retained its customer ID.
- **Result:** **Passed.** The end-to-end API workflow completed with correct association and persisted updates. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### ST-04 - Block customer-role edits to customer and vehicle records

- **Expected:** A lower-privilege user cannot update customer or vehicle information, and rejected updates are not saved.
- **Setup:** Built the current branch successfully and used an isolated in-memory SQLite database with a Customer account, linked customer record, vehicle, and Service Advisor account for verification.
- **Test actions:** Attempted to update the customer phone and vehicle model as the Customer, then reread both records as the Service Advisor.
- **Observed:** Both update requests returned HTTP 403. The subsequent reads showed the original phone and model unchanged.
- **Result:** **Passed.** Unauthorized updates were blocked and did not change stored data. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### UT-07 - Create a service request with valid information

- **Expected:** An authorized user can create and retrieve a service request with its vehicle and request date.
- **Setup:** Used an isolated in-memory SQLite database with a linked Customer account and registered vehicle.
- **Test action:** Submitted a General Service request for vehicle `KA01AB1234`, description `Engine inspection`, and request date `2026-09-15`, then retrieved it.
- **Observed:** The API created the request with HTTP 201 and returned the vehicle, service type, and description. The request date was absent from the response and stored service fields.
- **Result:** **Failed.** The required date from the test plan is not represented or persisted by the current request API.
- **Defect:** Request date field is unsupported. No code changes made, per instruction.

### UT-08 - Reject a service request with required information missing

- **Expected:** A request cannot be saved when required vehicle or request-date information is missing.
- **Setup:** Used an isolated in-memory SQLite database with a linked Customer account and registered vehicle.
- **Test actions:** Submitted a request with both vehicle and date blank, then submitted another with a valid vehicle but blank date.
- **Observed:** The request with a blank vehicle returned HTTP 400. The request with a valid vehicle and blank date returned HTTP 201.
- **Result:** **Failed.** Vehicle validation works, but a blank request date does not prevent request creation.
- **Defect:** Request date is unsupported and not validated. No code changes made, per instruction.

### UT-09 - Record service activity on assigned work

- **Expected:** A technician can view assigned work and record service activity details.
- **Setup:** Used an isolated in-memory SQLite database with Customer, Service Advisor, and Service Technician accounts and a registered vehicle.
- **Test actions:** Created a service request, validated and assigned it to the technician, opened assigned work, then recorded work performed and notes.
- **Observed:** The technician saw the assigned request. The execution update returned HTTP 200; reopening the request returned `Engine oil replaced` and `Oil and filter replaced`.
- **Result:** **Passed.** The assigned technician recorded service activity successfully.
- **Defect:** None observed in this API flow. Browser UI behavior was not tested.

### IT-07 - Link a service request to the correct vehicle

- **Expected:** A service request stores and displays its selected vehicle association.
- **Setup:** Used an isolated in-memory SQLite database with a linked Customer account and two registered vehicles.
- **Test actions:** Created a General Service request for vehicle `KA01AB1234`, then reopened it.
- **Observed:** Request creation returned HTTP 201; retrieval returned HTTP 200 with the expected vehicle and customer IDs.
- **Result:** **Passed.** The service request retained the correct vehicle association. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### IT-08 - Assign service work to a technician

- **Expected:** Authorized staff can assign work and the selected technician can see it in assigned work.
- **Setup:** Used an isolated in-memory SQLite database with Customer, Service Advisor, and Service Technician accounts and a registered vehicle.
- **Test actions:** Created and validated a request, assigned it to the technician, then retrieved the technician's assigned-work list.
- **Observed:** Assignment returned HTTP 200; the technician's assigned-work endpoint returned HTTP 200 and included the request with the selected technician ID.
- **Result:** **Passed.** The selected technician could view the assigned service work. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### IT-09 - Keep service activity with its original request

- **Expected:** Recorded service activity remains associated with the request where it was entered.
- **Setup:** Used an isolated in-memory SQLite database with two service requests, a Service Advisor, and a Service Technician.
- **Test actions:** Validated and assigned the brake inspection request, recorded `Brake inspection` and `Front pads inspected`, then reopened it and an unrelated request.
- **Observed:** The updated request returned HTTP 200 with the activity details. The unrelated request retained empty activity fields.
- **Result:** **Passed.** The activity remained on the correct service request. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.
