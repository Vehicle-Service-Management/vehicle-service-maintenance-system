# Vehicle Service & Maintenance Management System

## Member 4 Deliverable

**Owner:** Mmbasu, Documentation and Traceability Lead  
**Source baseline:** SRS Sections 1-5 and `Test_Plan_and_test_cases.docx`  
**Document status:** Draft for team review  
**Execution status:** Test results remain pending execution

## 6. Non-Functional Requirements

### 6.1 Security Objectives

- **SO-SEC-01: Confidentiality.** Protect credentials and customer, vehicle, service, and maintenance information from disclosure to unauthenticated or unauthorized users.
- **SO-SEC-02: Controlled access and accountability.** Ensure users can perform only role-authorized actions and that security-relevant access events can be reviewed.

### 6.2 Security Requirements

1. **NFR-SEC-01:** Authentication is required before a user can access protected functions.
2. **NFR-SEC-02:** Passwords and authentication data shall be transmitted and stored using the security controls provided by the deployment platform.
3. **NFR-SEC-03:** Role-based authorization shall be applied at the user-interface and service/data layers.
4. **NFR-SEC-04:** Users shall only view or modify customer, vehicle, service, and maintenance information permitted by their role.
5. **NFR-SEC-05:** Invalid credentials, expired sessions, and blocked operations shall produce a clear error without exposing sensitive data.
6. **NFR-SEC-06:** Security-relevant events, including login failures and unauthorized access attempts, should be auditable by an administrator.
7. **NFR-SEC-07:** Passwords shall not be stored in plaintext.

### 6.3 Performance and Capacity

1. Normal search, record retrieval, and status-display operations should respond within 3 seconds under expected operating load.
2. Record creation and update operations should provide success or validation feedback within 3 seconds under expected operating load.
3. The system should support the expected volume of customers, vehicles, service requests, and maintenance records without loss of data integrity.
4. Search results should be limited, paginated, or otherwise bounded when a query returns a large number of records.

### 6.4 Availability, Reliability, and Recovery

1. The system shall preserve successfully committed records and relationships between customers, vehicles, service requests, activities, and maintenance history.
2. A failed validation or interrupted save shall not create a partial record.
3. The deployment shall provide regular database backup and restore procedures.
4. After recovery from an infrastructure failure, the system shall return to a consistent state and prevent duplicate submissions where possible.

### 6.5 Usability and Accessibility

1. Forms shall label required fields and display actionable validation messages near the relevant input.
2. Navigation, terminology, and status values shall be consistent throughout the system.
3. Date, phone, registration-number, and other structured fields shall show the expected format.
4. Primary workflows shall be usable with keyboard navigation and readable on supported desktop and mobile viewports.

### 6.6 Maintainability and Compatibility

1. Business rules for authorization, validation, and status transitions should be implemented in reusable service components.
2. The system shall use documented interfaces between the user interface, application services, and persistent data store.
3. Configuration values, including environment-specific connection details, shall not be hard-coded into application logic.
4. The system shall be tested against the supported browser, runtime, and database versions recorded by the project team.

## 7. Other Requirements

### 7.1 Data and Retention Rules

1. Each vehicle shall have one identifiable customer association at a time.
2. Each service request shall retain its vehicle reference, request date, service information, assignment, and recorded activities.
3. Maintenance records shall retain their vehicle reference and maintenance details so that service history can be reconstructed.
4. Records shall not be physically deleted by ordinary users where deletion would break service-history traceability; a controlled archive or administrator process should be used instead.
5. Date and time values shall use one documented timezone policy and a consistent storage format.

### 7.2 Validation and Business Rules

1. Required fields shall be validated before a customer, vehicle, service request, activity, or maintenance record is saved.
2. A service request must reference a registered vehicle.
3. Only authorized service staff may assign service work, and technicians may view only work assigned to them.
4. Service status shall reflect recorded progress according to the status values defined by the implementation.
5. Search results shall be filtered by the requesting user's permissions before they are displayed.

### 7.3 Deployment and Operational Requirements

1. The project shall provide setup instructions, required environment variables, database initialization steps, and a supported start command.
2. Production credentials and personal customer data shall not be committed to source control.
3. The team shall retain the approved SRS, analysis models, test plan, test cases, execution results, and this RTM as project records.
4. Open assumptions, deferred requirements, and changes to requirement IDs shall be recorded in the project change log and reviewed before final submission.

## Glossary

| Term | Definition |
|---|---|
| Customer | A person or organization that owns or presents a vehicle for service. |
| Vehicle | A registered automobile identified by registration number and associated with a customer. |
| Service request | A request for work on a vehicle, including its date and service details. |
| Service activity | Work performed by a technician as part of a service request. |
| Maintenance record | A durable record of maintenance performed for a vehicle. |
| Service history | The chronological collection of service requests, activities, and maintenance records for a vehicle. |
| Service status | The current progress state of a service request or activity. |
| Service staff | An authorized user who manages customers, vehicles, requests, assignments, or records. |
| Technician | A service personnel user who views assigned work and records activities. |
| Role | A named set of permissions assigned to a user. |
| Authorization | The decision about which protected operation or record a user may access. |
| Authentication | Verification of a user's identity before protected access is granted. |
| RTM | Requirement Traceability Matrix; a mapping between requirements and verification artifacts. |
| Unit test | A test of a small component or function in isolation. |
| Integration test | A test of interactions between components or data relationships. |
| System test | An end-to-end test of a complete user workflow. |

## Field Layouts

The layouts below follow the entities and attributes shown in the Member 2 ER diagram. Primary-key and foreign-key labels are stated explicitly. The implementation may add audit fields such as `createdAt`, `updatedAt`, and `createdBy` without changing the ER-mapped fields.

### Customer

| Field | Required | Format / validation | Access |
|---|---|---|---|
| Customer_ID (PK) | Yes, generated | Unique system identifier | Authorized users, according to role |
| Name | Yes | Non-empty text | Authorized service staff create/update; permitted users view |
| Phone | Yes | Valid phone format | Authorized service staff create/update; permitted users view |
| Email | Recommended | Valid email format when supplied | Authorized users, according to role |
| Address | Recommended | Address text when supplied | Authorized users, according to role |

### Vehicle

| Field | Required | Format / validation | Access |
|---|---|---|---|
| Vehicle_ID (PK) | Yes, generated | Unique system identifier | Authorized users, according to role |
| Customer_ID (FK) | Yes | Must reference an existing CUSTOMER.Customer_ID | Authorized staff create/update; permitted users view |
| Registration_No | Yes | Non-empty, unique according to deployment rules | Authorized staff create/update; permitted users view |
| Make | Yes | Non-empty text | Authorized staff create/update; permitted users view |
| Model | Yes | Non-empty text | Authorized staff create/update; permitted users view |
| Year | Yes | Four-digit valid vehicle year | Authorized staff create/update; permitted users view |

### Service Request

| Field | Required | Format / validation | Access |
|---|---|---|---|
| Service_Request_ID (PK) | Yes, generated | Unique system identifier | Authorized users |
| Vehicle_ID (FK) | Yes | Must reference an existing VEHICLE.Vehicle_ID | Authorized users create; permitted users view |
| Request_Date | Yes | Valid date | Authorized users create/update; permitted users view |
| Service_Type | Yes | Controlled value or non-empty text | Authorized users create/update; permitted users view |
| Description | Yes | Non-empty service description | Authorized users create/update; permitted users view |
| Status | Yes, system-managed | Controlled lifecycle value | Authorized users, according to role |

### User

| Field | Required | Format / validation | Access |
|---|---|---|---|
| User_ID (PK) | Yes, generated | Unique system identifier | Administrator; user may view own profile |
| Name | Yes | Non-empty text | Administrator/user according to role |
| Username | Yes | Unique, non-empty login name | Administrator/user according to role |
| Password | Yes | Store as a secure password hash, never plaintext | Not displayed after entry; credential verification only |
| Role | Yes | One of the roles defined by the project | Administrator manages; authorization service reads |

### Service Activity

| Field | Required | Format / validation | Access |
|---|---|---|---|
| Activity_ID (PK) | Yes, generated | Unique system identifier | Authorized users |
| Service_Request_ID (FK) | Yes | Must reference an existing SERVICE_REQUEST.Service_Request_ID | Technician records; permitted users view |
| Technician_ID (FK) | Yes | Must reference an authorized USER.User_ID with technician role | Service staff assigns; technician views own work |
| Activity_Date | Yes | Valid date | Technician records; permitted users view |
| Description | Yes | Non-empty text | Technician records; permitted users view |
| Completion_Details | Conditional | Required when completion is recorded | Technician records; permitted users view |

### Maintenance Record

| Field | Required | Format / validation | Access |
|---|---|---|---|
| Maintenance_ID (PK) | Yes, generated | Unique system identifier | Authorized users |
| Vehicle_ID (FK) | Yes | Must reference an existing VEHICLE.Vehicle_ID | Authorized staff create/update; permitted users view |
| Activity_ID (FK) | As shown in ER model | Must reference the related SERVICE_ACTIVITY.Activity_ID | Authorized staff create/update; permitted users view |
| Maintenance_Date | Yes | Valid date | Authorized staff create/update; permitted users view |
| Details | Yes | Non-empty maintenance details | Authorized staff create/update; permitted users view |

**ER consistency note:** The ER diagram does not show an `Assigned_Technician` attribute on `SERVICE_REQUEST`; technician assignment is represented by `SERVICE_ACTIVITY.Technician_ID`. The diagram also shows `MAINTENANCE_RECORD.Activity_ID` as a foreign key. These layouts reflect the diagram as supplied. Priya should confirm those relationship choices if assignment is intended to exist at request level or if maintenance records should link directly to activities.

## Requirement Traceability Matrix

The test IDs below are taken from the current test-case document. `Pending` means the test case exists but execution evidence has not yet been recorded.

| Requirement ID | Requirement summary | Verification test IDs | Status |
|---|---|---|---|
| REQ-AUTH-01 | Authenticate registered users before protected access | UT-01, ST-01 | Pending |
| REQ-AUTH-02 | Validate authentication information | UT-01, UT-02, UT-03 | Pending |
| REQ-AUTH-03 | Provide access according to assigned role | IT-01, ST-01 | Pending |
| REQ-AUTH-04 | Restrict unauthorized protected functions | IT-02, ST-02 | Pending |
| REQ-AUTH-05 | Display a message when authentication fails | UT-02, ST-02 | Pending |
| REQ-AUTH-06 | Support defined user roles | IT-01, ST-01 | Pending |
| REQ-AUTH-07 | Protect functions according to authorization | IT-02, ST-01 | Pending |
| REQ-AUTH-08 | Restrict access after session expiry | IT-03, ST-02 | Pending |
| REQ-CV-01 | Register customer information | UT-04, ST-03 | Pending |
| REQ-CV-02 | View customer information by permission | IT-04, ST-04 | Pending |
| REQ-CV-03 | Update customer information | IT-05, ST-04 | Pending |
| REQ-CV-04 | Register vehicle information | UT-06 | Pending |
| REQ-CV-05 | Associate a vehicle with the correct customer | UT-06, IT-06 | Pending |
| REQ-CV-06 | View vehicle information by permission | IT-04, ST-04 | Pending |
| REQ-CV-07 | Update vehicle information | IT-05, IT-06, ST-04 | Pending |
| REQ-CV-08 | Validate required customer and vehicle information | UT-05, IT-05, ST-03 | Pending |
| REQ-SR-01 | Create service requests | UT-07, ST-05 | Pending |
| REQ-SR-02 | Record the vehicle for each service request | UT-08, IT-07 | Pending |
| REQ-SR-03 | Record request date and service information | UT-07, UT-08 | Pending |
| REQ-SR-04 | Manage service requests | IT-08 | Pending |
| REQ-SR-05 | Assign work to service personnel | IT-08, ST-06 | Pending |
| REQ-SR-06 | Let technicians view assigned work | UT-09, IT-08, ST-06 | Pending |
| REQ-SR-07 | Record technician service activities | UT-09, IT-09 | Pending |
| REQ-SR-08 | Associate activities with the relevant request | IT-09, ST-05, ST-06 | Pending |
| REQ-MH-01 | Maintain vehicle maintenance records | UT-10, IT-11, ST-07 | Pending |
| REQ-MH-02 | Associate maintenance records with the relevant vehicle | IT-11 | Pending |
| REQ-MH-03 | Record maintenance details | UT-10, IT-12 | Pending |
| REQ-MH-04 | Update status from service progress | UT-11, IT-10 | Pending |
| REQ-MH-05 | View current service status | UT-12, ST-08 | Pending |
| REQ-MH-06 | Maintain vehicle service history | IT-12 | Pending |
| REQ-MH-07 | Retrieve relevant service history | UT-12, ST-08 | Pending |
| REQ-MH-08 | Present service and maintenance information consistently | IT-12, ST-07, ST-08 | Pending |
| REQ-INFO-01 | Provide search for authorized users | UT-13, UT-14, IT-13, ST-09 | Pending |
| REQ-INFO-02 | Search permitted customer records | UT-13, IT-15 | Pending |
| REQ-INFO-03 | Search permitted vehicle records | UT-14, IT-15 | Pending |
| REQ-INFO-04 | Search permitted service request records | IT-13, IT-15 | Pending |
| REQ-INFO-05 | Retrieve service activity information | IT-14 | Pending |
| REQ-INFO-06 | Display records matching search criteria | UT-13, UT-14, UT-15, IT-13, IT-14, ST-09 | Pending |
| REQ-INFO-07 | Display a message when no records match | UT-15, ST-10 | Pending |
| REQ-INFO-08 | Restrict results to authorized information | IT-15, ST-10 | Pending |

### Security and NFR Traceability

The current Member 3 test plan does not yet contain test cases for these security non-functional requirements. Harshith should add the test cases and IDs; replace the pending references below with those IDs after they are added. No test result is asserted here.

| Requirement ID | Requirement summary | Verification test IDs | Execution status |
|---|---|---|---|
| NFR-SEC-01 | Require authentication before protected access | Pending Harshith test ID | Not executed |
| NFR-SEC-02 | Protect credentials in transit and at rest; do not store plaintext passwords | Pending Harshith test ID | Not executed |
| NFR-SEC-03 | Enforce role-based authorization at UI and service/data layers | Pending Harshith test ID | Not executed |
| NFR-SEC-04 | Restrict customer, vehicle, service, and maintenance data by role | Pending Harshith test ID | Not executed |
| NFR-SEC-05 | Handle failed authentication, expired sessions, and blocked operations without leaking sensitive data | Pending Harshith test ID | Not executed |
| NFR-SEC-06 | Make security-relevant events auditable | Pending Harshith test ID | Not executed |
| NFR-SEC-07 | Prevent storage of plaintext passwords | Pending Harshith test ID | Not executed |

Security objectives are traced to their supporting requirements: SO-SEC-01 is supported by NFR-SEC-02, NFR-SEC-04, NFR-SEC-05, and NFR-SEC-07; SO-SEC-02 is supported by NFR-SEC-01, NFR-SEC-03, NFR-SEC-06, and NFR-SEC-07.

### RTM Review Checklist

- [x] Every functional requirement from Sections 3-5 has an RTM row.
- [x] Every functional requirement currently references at least one test case from the Member 3 test plan.
- [x] Security/NFR rows are included and await Harshith's test-case IDs.
- [x] Test execution results are not marked Pass or Fail before execution.
- [ ] Replace `Pending` with the executed result and evidence reference after QA execution.
- [ ] Replace pending security test-ID references after Harshith adds those test cases.
- [ ] Add trace links to implementation modules when the application structure is finalized.
- [ ] Review requirement changes from Priya before final SRS formatting and submission.