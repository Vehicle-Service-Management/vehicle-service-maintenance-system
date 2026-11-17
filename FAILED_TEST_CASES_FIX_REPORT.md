# Previously Failed Test Cases: Fix and Retest Report

**Branch:** `test/st01-retest-2026-11-02`  
**Report date:** 2026-11-05  
**Final automated suite:** 40 passed, 0 failed

## Summary

The earlier failed cases fell into three areas: requested-date validation and persistence (UT-07, UT-08), vehicle maintenance history (UT-10, IT-11, IT-12, ST-07, ST-08), and search (UT-13, UT-14, UT-15, IT-13, IT-14, IT-15, ST-09, ST-10).

The maintenance work adds a database table, authorized maintenance-entry and vehicle-history API routes, and a staff maintenance/history screen. The search work adds case-insensitive API filters that preserve existing role scoping, plus customer, vehicle, and service search controls with empty-result states. The requested service date is now required, validated, stored, and returned by the service API.

Each case below has a distinct named regression test in `test/app.test.ts`; all 13 maintenance/search cases were run individually, then all 40 tests were run together. API and client production builds also passed. The tests exercise API behavior; the React screens were build-checked, not browser-automated.

## Case-by-case report

### UT-07 — Create a service request with valid information

- **What failed:** The original API accepted and created a service request, but omitted the requested date from the response and stored record.
- **Change made:** Added/migrated the `services.request_date` column; made `requestDate` a required ISO date in the create schema; included it in service insert, update, select, and response mapping; added the required date field to the request form and service displays.
- **Retest:** Passed. A request dated `2026-09-15` was created and retrieved with that date. Request-date persistence is exercised by the request-date test in `test/app.test.ts`; the earlier targeted API round-trip and migration verification is recorded in `TEST_EXECUTION_LOG.md`.
- **Related commits:** `46177aa` (persist requested date), `6917f8e` (require requested date).

### UT-08 — Reject a service request with required information missing

- **What failed:** A request with a valid vehicle and blank date returned HTTP 201; a missing vehicle was rejected, but the required date was not.
- **Change made:** Request creation now requires a valid ISO calendar date. Missing, blank, or malformed dates are rejected with HTTP 400. The request form also requires and validates a date before submitting.
- **Retest:** Passed. Missing, blank, and invalid dates were rejected; a valid date was accepted and persisted. Automated coverage is in the request-date validation test in `test/app.test.ts`.
- **Related commits:** `6917f8e`.

### UT-10 — Record maintenance details for a vehicle

- **What failed:** The maintenance POST returned HTTP 404 because there was no maintenance route or entry form.
- **Change made:** Added `maintenance_records` storage and a staff-only `POST /api/vehicles/:id/maintenance` route. It validates the date/details, checks the vehicle, writes an audit event, and returns the created record. Added date/details entry and history display to Vehicle Management.
- **Retest:** Passed individually. A dated record was created and returned in the same vehicle's history.
- **Regression test:** `UT-10 retest: create and read a dated vehicle maintenance record`.
- **Related commit:** `93e31db`.

### IT-11 — Associate a maintenance record with the correct vehicle

- **What failed:** No maintenance record could be created or retrieved for either vehicle.
- **Change made:** Each record stores a required `vehicle_id`; history queries filter by that ID and are ordered by maintenance date.
- **Retest:** Passed individually. A record created for Vehicle A appears in Vehicle A history, while Vehicle B history remains empty.
- **Regression test:** `IT-11 retest: maintenance record belongs only to its selected vehicle`.

### IT-12 — Reflect service and maintenance details in vehicle history

- **What failed:** Completed service activity appeared in service requests, but separate maintenance details could not be recorded or shown with it.
- **Change made:** Added `GET /api/vehicles/:id/history`, which returns service records and maintenance records for the requested vehicle. Maintenance entries may link to a completed service belonging to that same vehicle.
- **Retest:** Passed individually. History returned the completed service activity and its linked maintenance record together.
- **Regression test:** `IT-12 retest: vehicle history combines completed service and maintenance entries`.

### ST-07 — Complete maintenance and status history workflow

- **What failed:** Service completion and service history worked, but the maintenance step returned 404 and left no maintenance entry.
- **Change made:** Added maintenance creation and combined vehicle history. The maintenance schema optionally links an entry to a completed service on the same vehicle, and the history response includes service status and work performed.
- **Retest:** Passed individually. The completed service and dated maintenance detail were both retrieved against the same vehicle.
- **Regression test:** `ST-07 retest: completed status and maintenance persist in the same vehicle history`.

### ST-08 — Show service and maintenance information with role restrictions

- **What failed:** Service access was scoped, but maintenance history was unsupported, so the complete restricted-history workflow could not pass.
- **Change made:** Vehicle history is available to Administrators, Service Advisors, and Customers. A customer can only retrieve history for a vehicle linked to their account; an unauthorized vehicle returns 404. Other staff roles are denied by role middleware. Maintenance creation is restricted to Administrators and Service Advisors.
- **Retest:** Passed individually. The owning Customer received HTTP 200, another Customer received 404, and a Service Technician received 403 on vehicle history.
- **Regression test:** `ST-08 retest: vehicle history enforces customer ownership and staff roles`.
- **Scope note:** This test verifies API authorization and data scope.

### UT-13 — Search customer records

- **What failed:** The customer-list API ignored the search term and the customer screen had no search field.
- **Change made:** `GET /api/customers?search=...` filters name, email, and phone case-insensitively and computes the filtered total. Customer Management now includes a search field and a no-match state.
- **Retest:** Passed individually. Searching `Rahul` returned only Rahul Kumar.
- **Regression test:** `UT-13 retest: customer search filters by name`.

### UT-14 — Search vehicle records

- **What failed:** The vehicle list ignored registration search and the vehicle screen had no search control.
- **Change made:** Added a staff-only vehicle search endpoint covering registration, make, model, and customer name. The customer-specific vehicle list also accepts a search term. Vehicle Management now has a search field.
- **Retest:** Passed individually. Searching for `KA01AB1234` returned only that vehicle.
- **Regression test:** `UT-14 retest: vehicle search filters by registration`.

### UT-15 — Show a no-results message for unmatched search

- **What failed:** An unmatched registration search returned the unfiltered vehicle list, and the screen had no search-specific empty state.
- **Change made:** Vehicle search returns an empty array and total zero when nothing matches. Vehicle Management displays “No matching vehicles” for an empty search result.
- **Retest:** Passed individually. Searching `KA99ZZ9999` returned zero results and an empty vehicle list.
- **Regression test:** `UT-15 retest: unmatched vehicle search returns an empty result`.
- **Scope note:** The API no-result behavior was automated; the visual UI state was build-checked, not browser-automated.

### IT-13 — Search service request records

- **What failed:** `GET /api/services` ignored the request identifier search and returned unrelated requests.
- **Change made:** Added a search filter covering service IDs and other request fields to the service-list query.
- **Retest:** Passed individually. Searching by a known request ID returned only that request.
- **Regression test:** `IT-13 retest: service request search filters by request identifier`.

### IT-14 — Search service activity information

- **What failed:** Work-performed activity was saved, but the service list did not filter on it.
- **Change made:** Service search now includes `work_performed` and service notes in addition to request and vehicle fields.
- **Retest:** Passed individually. Searching `Brake inspection` returned only the service with that recorded activity.
- **Regression test:** `IT-14 retest: service search filters by recorded activity`.

### IT-15 — Restrict search results by user permissions

- **What failed:** Cross-customer direct access was blocked, but search was ignored, so permission-scoped search behavior was not demonstrated.
- **Change made:** Search predicates are added to the existing role and ownership conditions. Customer service searches remain limited to that customer's linked vehicles; technician scoping remains in the existing service-list conditions.
- **Retest:** Passed individually. A Customer searching a term present in two customers' records received only their own matching request.
- **Regression test:** `IT-15 retest: customer service search is limited to that customer's records`.

### ST-09 — Complete search workflow across records

- **What failed:** Customer, vehicle, and service search terms were ignored, and the UI had no search workflow.
- **Change made:** Implemented customer, vehicle, and service API filters, including activity fields; added search controls and result display to the staff screens.
- **Retest:** Passed individually. Matching customer, vehicle registration, request ID, and activity searches each returned one result.
- **Regression test:** `ST-09 retest: customer, vehicle, request, and activity searches return their matches`.
- **Scope note:** API search behavior was automated; screen interactions were build-checked, not browser-automated.

### ST-10 — Verify search no-result and security behavior

- **What failed:** The nonexistent term was ignored and staff results were returned. Existing customer scoping worked, but search-specific no-result behavior was not implemented.
- **Change made:** Added filtered totals and empty results for unmatched searches while retaining customer ownership conditions and direct-access checks.
- **Retest:** Passed individually. An unmatched term returned zero; another customer's service remained absent from search and direct access returned 404.
- **Regression test:** `ST-10 retest: unmatched search is empty and cross-customer service stays hidden`.

## Verification and commits

- Full automated suite: **40 passed, 0 failed**. The 13 maintenance/search cases were also run individually with Node's test-name filter.
- API production build: passed. Client production build: passed.
- Node 24 in this environment raised `uv_os_get_passwd returned ENOMEM` from `os.userInfo()` when starting the test runner. Tests passed with a temporary `NODE_OPTIONS` shim outside the repository; no shim was committed.
- Implementation commit: `93e31db` (`feat: add maintenance history and record search`).
- Individual test evidence and execution-log results were committed and pushed to `test/st01-retest-2026-11-02`; final log correction commit: `77aa9d8`.
