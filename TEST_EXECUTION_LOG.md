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
| ST-05 | Passed | Request review, assignment, technician activity, and service record update completed successfully |
| ST-06 | Passed | Technician saw own request; other technician's request returned 404 and update was denied (403) |
| UT-10 | Failed | Maintenance-record submission returned 404; no maintenance-record endpoint is implemented |
| UT-11 | Passed | Completing service activity changed status to completed and set completion time |
| UT-12 | Passed | Customer retrieved current completed status and two service-history records for the vehicle |
| IT-10 | Passed | Completing the assigned service activity updated its request status to completed |
| IT-11 | Failed | Maintenance save returned 404; no vehicle maintenance history entry was created |
| IT-12 | Failed | Completed activity appeared in service history, but maintenance save returned 404 and no maintenance details were available |
| ST-07 | Failed | Service reached completed status, but maintenance record save returned 404 and history lacked maintenance details |
| ST-08 | Failed | Service access was correctly restricted, but vehicle maintenance details were unavailable (maintenance save 404) |
| UT-13 | Failed | Customer search query returned both records instead of filtering to Rahul Kumar |
| UT-14 | Failed | Vehicle search query returned both registrations instead of filtering to KA01AB1234 |
| UT-15 | Failed | Nonmatching registration search returned both vehicles instead of a no-results response |
| IT-13 | Failed | Request-ID search returned both service requests; query was not applied |
| IT-14 | Failed | Activity search returned both service requests instead of filtering to the matching activity |
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

### ST-05 - Complete the service workflow

- **Expected:** Service request creation, review, assignment, technician activity, and service record update are maintained end to end.
- **Setup:** Used an isolated in-memory SQLite database with Customer, Service Advisor, and Service Technician accounts and a registered vehicle.
- **Test actions:** Created a General Service request, validated it, assigned it to the technician, recorded work performed and notes, then reopened the service record.
- **Observed:** The technician saw the assigned work. The execution update returned HTTP 200; the reopened record retained the vehicle, assignment, activity details, and `in_progress` status.
- **Result:** **Passed.** The service workflow and its data were maintained end to end. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### ST-06 - Restrict technicians to their assigned work

- **Expected:** A technician can view assigned work but cannot access a request assigned to another technician.
- **Setup:** Used an isolated in-memory SQLite database with two technicians, two service requests, and a Service Advisor.
- **Test actions:** Assigned one request to each technician, viewed Technician A's assigned-work list, and attempted to view and update Technician B's request as Technician A.
- **Observed:** Technician A's list contained only its own request. Its own request returned HTTP 200; Technician B's request returned HTTP 404, and an update attempt returned HTTP 403.
- **Result:** **Passed.** A technician could access only assigned work.
- **Defect:** None observed in this API flow. Browser UI behavior was not tested.

### UT-10 - Record maintenance details for a vehicle

- **Expected:** An authorized user can save a dated maintenance record for a vehicle.
- **Setup:** Used an isolated in-memory SQLite database with a Service Advisor account and registered vehicle `KA10AB1001`. Source inspection found no maintenance-record form or API route in the current build.
- **Test action:** Submitted maintenance date `2026-09-15` and details `Brake pads replaced` to the vehicle maintenance route.
- **Observed:** The request returned HTTP 404 `Not found`; no maintenance record was created.
- **Result:** **Failed.** This build does not provide a maintenance-record endpoint/form.
- **Defect:** Vehicle maintenance record entry is unsupported. No code changes made, per instruction.

### UT-11 - Update service status when progress is recorded

- **Expected:** Recording service progress/completion updates the service status.
- **Setup:** Used an isolated in-memory SQLite database with Customer, Service Advisor, and Service Technician accounts and a registered vehicle.
- **Test actions:** Created, validated, and assigned a service request; recorded work performed; moved it to `in_progress`, then `completed`; reopened the record.
- **Observed:** Both execution updates returned HTTP 200. The reopened service had status `completed` and a completion timestamp.
- **Result:** **Passed.** Service status reflected the recorded completion. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### UT-12 - Retrieve current status and service history

- **Expected:** An authorized user can retrieve current service status and relevant vehicle history.
- **Setup:** Used an isolated in-memory SQLite database with a linked Customer account, one registered vehicle, a completed service, and a second request.
- **Test actions:** Retrieved the completed request status and listed the customer's service requests.
- **Observed:** The current request returned status `completed`; the service list returned both vehicle-linked records.
- **Result:** **Passed.** Current status and service history were available through the customer service-request endpoints. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### IT-10 - Reflect service activity completion in status

- **Expected:** Completing a service activity updates the related service request status.
- **Setup:** Used an isolated in-memory SQLite database with Customer, Service Advisor, and Service Technician accounts, a registered vehicle, and a service request.
- **Test actions:** Validated and assigned the request, recorded `Brake pads replaced`, completed the activity, and reopened the service status.
- **Observed:** The completion update returned HTTP 200. The related request showed status `completed`, the recorded work, and a completion timestamp.
- **Result:** **Passed.** Completion updated the related service status. Browser UI behavior was not tested.
- **Defect:** None observed in this API flow.

### IT-11 - Associate a maintenance record with the correct vehicle

- **Expected:** A maintenance record appears in Vehicle A history and not in Vehicle B history.
- **Setup:** Used an isolated in-memory SQLite database with a Service Advisor account and two registered vehicles.
- **Test action:** Submitted a maintenance record for Vehicle A and queried service history.
- **Observed:** The maintenance submission returned HTTP 404. No maintenance record appeared for either vehicle.
- **Result:** **Failed.** This build has no vehicle maintenance-record endpoint.
- **Defect:** Maintenance record creation and vehicle history association are unsupported. No code changes made, per instruction.

### IT-12 - Reflect service and maintenance details in vehicle history

- **Expected:** Completed service activity and maintenance details appear consistently in the vehicle's service history.
- **Setup:** Used an isolated in-memory SQLite database with a Customer, Service Advisor, Service Technician, registered vehicle, and completed service request.
- **Test actions:** Completed the service activity, attempted to save a maintenance record, then queried the service list.
- **Observed:** Completed service activity appeared in the service list. The maintenance submission returned HTTP 404, and no maintenance details were present.
- **Result:** **Failed.** Service history contains the completed activity but cannot include a separately recorded maintenance entry.
- **Defect:** Vehicle maintenance record creation is unsupported. No code changes made, per instruction.

### ST-07 - Complete maintenance and status history workflow

- **Expected:** Completion updates status and maintenance information is stored against the correct vehicle and shown in history.
- **Setup:** Used an isolated in-memory SQLite database with Customer, Service Advisor, Service Technician, a registered vehicle, and an active service request.
- **Test actions:** Updated service progress to completed, attempted to record maintenance details, then retrieved status and service history.
- **Observed:** Service status became `completed` and the service appeared in history. Maintenance record submission returned HTTP 404; no maintenance details appeared in the history.
- **Result:** **Failed.** Status and service history work, but the required maintenance record step is unavailable.
- **Defect:** Vehicle maintenance record creation is unsupported. No code changes made, per instruction.

### ST-08 - Show service and maintenance information with role restrictions

- **Expected:** Authorized users can view relevant maintenance/service history; unauthorized users are denied or restricted.
- **Setup:** Used an isolated in-memory SQLite database with a Service Advisor, Service Technician, two Customers, customer-linked vehicles, and a service request with recorded progress.
- **Test actions:** Retrieved service history as the Advisor and owning Customer, attempted access as another Customer, and attempted to save a vehicle maintenance record.
- **Observed:** Advisor and owning Customer could view the service. The other Customer received HTTP 404 for the request and an empty history list. The maintenance submission returned HTTP 404.
- **Result:** **Failed.** Service information access was appropriately restricted, but maintenance records are not supported by this build.
- **Defect:** Vehicle maintenance record creation is unsupported. No code changes made, per instruction.

### UT-13 - Search customer records

- **Expected:** Searching for `Rahul Kumar` displays matching customer records.
- **Setup:** Used an isolated in-memory SQLite database with a Service Advisor and two customer records: Rahul Kumar and Priya Shah.
- **Test action:** Requested the customer list with the search query `Rahul`.
- **Observed:** The API returned HTTP 200 but returned both customer records; the query was not applied. The current customer screen also has no search control.
- **Result:** **Failed.** Customer search does not filter results.
- **Defect:** Customer search is unavailable. No code changes made, per instruction.

### UT-14 - Search vehicle records

- **Expected:** Searching for registration `KA01AB1234` displays the matching vehicle.
- **Setup:** Used an isolated in-memory SQLite database with a Service Advisor and two vehicles under one customer.
- **Test action:** Requested the customer's vehicle list with the registration query `KA01AB1234`.
- **Observed:** The API returned HTTP 200 but returned both registrations; the query was not applied. The current vehicle screen also has no search control.
- **Result:** **Failed.** Vehicle search does not filter results.
- **Defect:** Vehicle search is unavailable. No code changes made, per instruction.

### UT-15 - Show a no-results message for unmatched search

- **Expected:** Searching for registration `KA99ZZ9999` displays no matching records and an appropriate no-results message.
- **Setup:** Used an isolated in-memory SQLite database with a Service Advisor and two vehicle records.
- **Test action:** Requested the customer's vehicle list with the nonmatching registration query.
- **Observed:** The API returned HTTP 200 with both vehicles; the query was ignored. The vehicle screen has no search field or no-results state for searching.
- **Result:** **Failed.** Search does not filter the list or produce a no-results response.
- **Defect:** Vehicle search/no-results behavior is unavailable. No code changes made, per instruction.

### IT-13 - Search service request records

- **Expected:** Searching by a known service request identifier returns the matching request.
- **Setup:** Used an isolated in-memory SQLite database with a Service Advisor, Customer, and two service requests.
- **Test action:** Requested the service list with the first request's ID as the search query.
- **Observed:** The API returned HTTP 200 with both service requests; the query was ignored.
- **Result:** **Failed.** Service request search does not filter results.
- **Defect:** Service request search is unavailable. No code changes made, per instruction.

### IT-14 - Search service activity information

- **Expected:** Searching by activity details returns the relevant service activity.
- **Setup:** Used an isolated in-memory SQLite database with a Service Advisor, Customer, Service Technician, and two service requests.
- **Test actions:** Recorded `Brake inspection` on one request, then requested the service list with that activity as the search query.
- **Observed:** The activity was stored on its request, but the API returned both service requests; the query was ignored.
- **Result:** **Failed.** Activity details can be retrieved by request, but activity search does not filter results.
- **Defect:** Service activity search is unavailable. No code changes made, per instruction.
