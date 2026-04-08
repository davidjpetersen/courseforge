# Requirements Document

## Introduction

The Authentication, Tenant Management, and Role-Based Access Control (RBAC) system is the security foundation for CourseForge Connect. It provides direct JWT-based authentication (no third-party auth libraries), multi-tenant isolation via DynamoDB single-table design, and a three-tier role hierarchy (admin, builder, viewer) that governs access to all platform operations. The system covers user registration with automatic tenant provisioning, login/logout, session management via HttpOnly cookies, team invitation workflows, and admin-level member management including role changes and suspension. This feature underpins story S23 (role-based access control) and provides the auth foundation required by all other CourseForge Connect features.

Stack: Next.js App Router, DynamoDB, JWT via jose library, bcrypt for password hashing. No NextAuth or third-party auth libraries.

## Glossary

- **Auth_System**: The authentication subsystem responsible for user registration, login, logout, session validation, and JWT lifecycle management.
- **RBAC_Engine**: The role-based access control subsystem that evaluates a user's role against required permissions for a given operation.
- **Tenant**: An isolated organizational account within CourseForge Connect, identified by a unique tenantId (UUID).
- **User_Record**: A DynamoDB item representing a registered user, keyed by PK=TENANT#{tenantId}, SK=USER#{userId}.
- **Email_Index_Record**: A DynamoDB item enabling email-based user lookup, keyed by PK=EMAIL#{email}, SK=META.
- **Invite_Record**: A DynamoDB item representing a pending team invitation, keyed by PK=TENANT#{tenantId}, SK=INVITE#{inviteId}.
- **UserRole**: An enumeration of permission tiers: 'admin', 'builder', or 'viewer'.
- **JWT_Token**: A JSON Web Token (HS256, 1-hour expiry) containing userId, tenantId, role, and email claims, used for session authentication.
- **Session_Cookie**: An HttpOnly, SameSite=Strict, Secure cookie named courseforge_session that carries the JWT_Token.
- **Auth_Middleware**: A Next.js middleware function (withAuth) that extracts, verifies, and decodes the JWT_Token from the Session_Cookie and attaches user context to the request.
- **Team_Management_API**: The set of API routes for inviting users, listing members, changing roles, and suspending users within a Tenant.
- **Role_Hierarchy**: The permission inheritance model where admin includes all builder permissions, and builder includes all viewer permissions.
- **Tenant_Bootstrap**: The existing bootstrapTenant function that provisions default environments and audit entries for a new Tenant.

## Requirements

### Requirement 1: User Registration with Tenant Provisioning

**User Story:** As a new user, I want to register with my email, password, and organization name, so that a new tenant is created and I become its admin.

#### Acceptance Criteria

1. WHEN a user submits a registration request with email, password, and tenantName, THE Auth_System SHALL validate that the email conforms to a standard email format.
2. WHEN a user submits a registration request, THE Auth_System SHALL validate that the password is at least 12 characters long.
3. WHEN the email already exists in the Email_Index_Record, THE Auth_System SHALL reject the registration with a 409 status code and an error message indicating the email is already registered.
4. WHEN validation passes, THE Auth_System SHALL hash the password using bcrypt with 12 rounds.
5. WHEN validation passes, THE Auth_System SHALL generate a unique tenantId (UUID) and userId (UUID).
6. WHEN validation passes, THE Auth_System SHALL write a Tenant record, a User_Record with role set to 'admin' and status set to 'active', and an Email_Index_Record in DynamoDB.
7. WHEN the records are written, THE Auth_System SHALL call the Tenant_Bootstrap function with the tenantId and userId.
8. WHEN registration completes, THE Auth_System SHALL sign a JWT_Token (HS256, 1-hour expiry) containing userId, tenantId, role, and email.
9. WHEN registration completes, THE Auth_System SHALL set the Session_Cookie (HttpOnly, SameSite=Strict, Secure) containing the JWT_Token.
10. WHEN registration completes, THE Auth_System SHALL return a response containing userId, tenantId, email, and role.

### Requirement 2: User Login

**User Story:** As a registered user, I want to log in with my email and password, so that I can access the platform with my assigned role.

#### Acceptance Criteria

1. WHEN a user submits a login request with email and password, THE Auth_System SHALL look up the Email_Index_Record to retrieve the userId and tenantId.
2. WHEN the Email_Index_Record is found, THE Auth_System SHALL fetch the User_Record and verify that the user status is 'active'.
3. WHEN the user status is 'active', THE Auth_System SHALL verify the submitted password against the stored passwordHash using bcrypt.compare.
4. IF the email does not exist, the user status is not 'active', or the password does not match, THEN THE Auth_System SHALL return a 401 status code with the error message 'Invalid credentials' without distinguishing between failure reasons.
5. WHEN authentication succeeds, THE Auth_System SHALL sign a JWT_Token and set the Session_Cookie.
6. WHEN authentication succeeds, THE Auth_System SHALL update the lastLoginAt field on the User_Record.
7. WHEN authentication succeeds, THE Auth_System SHALL return the user object containing userId, tenantId, email, role, and lastLoginAt.

### Requirement 3: User Logout

**User Story:** As an authenticated user, I want to log out, so that my session is terminated.

#### Acceptance Criteria

1. WHEN a user submits a logout request, THE Auth_System SHALL clear the Session_Cookie by setting it to an empty value with an expired date.
2. WHEN the cookie is cleared, THE Auth_System SHALL return a 204 status code with no body.

### Requirement 4: Session Validation (GET /api/auth/me)

**User Story:** As an authenticated user, I want to retrieve my current session information, so that the frontend can display my identity and role.

#### Acceptance Criteria

1. WHEN a request is made to the session endpoint, THE Auth_System SHALL extract and verify the JWT_Token from the Session_Cookie.
2. IF the Session_Cookie is missing or the JWT_Token is invalid or expired, THEN THE Auth_System SHALL return a 401 status code.
3. WHEN the JWT_Token is valid, THE Auth_System SHALL return the current user object containing userId, tenantId, email, role, and lastLoginAt.

### Requirement 5: Auth Middleware (withAuth)

**User Story:** As a developer, I want a reusable auth middleware that verifies JWT tokens and enforces role-based access, so that all protected API routes share consistent authentication and authorization logic.

#### Acceptance Criteria

1. THE Auth_Middleware SHALL extract the JWT_Token from the Session_Cookie on each request.
2. THE Auth_Middleware SHALL verify the JWT_Token signature using the AUTH_JWT_SECRET environment variable.
3. IF the Session_Cookie is missing or the JWT_Token is invalid or expired, THEN THE Auth_Middleware SHALL return a 401 status code.
4. WHEN a requiredRole parameter is specified, THE Auth_Middleware SHALL evaluate the user's role against the Role_Hierarchy.
5. IF the user's role does not satisfy the requiredRole according to the Role_Hierarchy, THEN THE Auth_Middleware SHALL return a 403 status code with a body containing the error 'Insufficient permissions' and the requiredRole.
6. WHEN authentication and authorization succeed, THE Auth_Middleware SHALL attach userId, tenantId, role, and email to the request context.
7. THE Auth_Middleware SHALL export convenience wrappers: requireAdmin, requireBuilder, and requireViewer.

### Requirement 6: Role Hierarchy Enforcement

**User Story:** As a platform operator, I want roles to follow a strict hierarchy, so that higher-privilege roles inherit all lower-privilege permissions.

#### Acceptance Criteria

1. THE RBAC_Engine SHALL define the Role_Hierarchy as: admin includes all builder permissions, builder includes all viewer permissions, viewer has read-only access.
2. WHEN a route requires the 'viewer' role, THE RBAC_Engine SHALL grant access to users with 'viewer', 'builder', or 'admin' roles.
3. WHEN a route requires the 'builder' role, THE RBAC_Engine SHALL grant access to users with 'builder' or 'admin' roles.
4. WHEN a route requires the 'admin' role, THE RBAC_Engine SHALL grant access only to users with the 'admin' role.

### Requirement 7: Team Invitation

**User Story:** As an admin, I want to invite new team members by email with a specific role, so that I can grow my organization's team on the platform.

#### Acceptance Criteria

1. WHEN an admin submits an invite request with an email and a UserRole, THE Team_Management_API SHALL create an Invite_Record with expiresAt set to 48 hours from creation.
2. THE Team_Management_API SHALL require the 'admin' role to create invitations.
3. IF a non-admin user attempts to create an invitation, THEN THE Team_Management_API SHALL return a 403 status code.
4. WHEN the Invite_Record is created, THE Team_Management_API SHALL return an invite URL in the format '/accept-invite?token={inviteId}'.
5. THE Team_Management_API SHALL store the invitedBy field as the userId of the admin who created the invitation.

### Requirement 8: Accept Team Invitation

**User Story:** As an invited user, I want to accept an invitation and create my account, so that I can join the team with the role assigned to me.

#### Acceptance Criteria

1. WHEN a user submits an accept-invite request with inviteId, email, and password, THE Team_Management_API SHALL validate that the Invite_Record exists.
2. IF the Invite_Record does not exist, THEN THE Team_Management_API SHALL return a 404 status code.
3. IF the Invite_Record has already been accepted, THEN THE Team_Management_API SHALL return a 409 status code with an error indicating the invite has already been used.
4. IF the Invite_Record expiresAt is in the past, THEN THE Team_Management_API SHALL return a 410 status code with an error indicating the invite has expired.
5. WHEN the invite is valid, THE Team_Management_API SHALL validate the password (minimum 12 characters) and create a User_Record with the role specified in the Invite_Record and status set to 'active'.
6. WHEN the User_Record is created, THE Team_Management_API SHALL create an Email_Index_Record for the new user.
7. WHEN the user is created, THE Team_Management_API SHALL mark the Invite_Record as accepted.
8. WHEN the invite is accepted, THE Team_Management_API SHALL sign a JWT_Token, set the Session_Cookie, and return userId, tenantId, and role.

### Requirement 9: List Team Members

**User Story:** As an admin, I want to view all team members in my tenant, so that I can manage my organization's users.

#### Acceptance Criteria

1. THE Team_Management_API SHALL require the 'admin' role to list team members.
2. WHEN an admin requests the member list, THE Team_Management_API SHALL query DynamoDB for all items with PK=TENANT#{tenantId} and SK beginning with 'USER#'.
3. THE Team_Management_API SHALL return a members array containing userId, email, role, status, and lastLoginAt for each user.

### Requirement 10: Change Team Member Role

**User Story:** As an admin, I want to change a team member's role, so that I can adjust permissions as responsibilities change.

#### Acceptance Criteria

1. THE Team_Management_API SHALL require the 'admin' role to change a member's role.
2. WHEN an admin submits a role change for a user, THE Team_Management_API SHALL update the role field on the target User_Record.
3. IF an admin attempts to change their own role, THEN THE Team_Management_API SHALL return a 422 status code with an error indicating self-demotion is not allowed.
4. WHEN the role is changed, THE Team_Management_API SHALL write an audit log entry with actionType 'USER_ROLE_CHANGED' and detail containing oldRole and newRole.
5. WHEN the role is changed, THE Team_Management_API SHALL return the userId and the new role.

### Requirement 11: Suspend Team Member

**User Story:** As an admin, I want to suspend a team member, so that the member can no longer access the platform.

#### Acceptance Criteria

1. THE Team_Management_API SHALL require the 'admin' role to suspend a member.
2. WHEN an admin submits a suspend request for a user, THE Team_Management_API SHALL set the target User_Record status to 'suspended'.
3. IF an admin attempts to suspend themselves, THEN THE Team_Management_API SHALL return a 422 status code with an error indicating self-suspension is not allowed.
4. WHEN the user is suspended, THE Team_Management_API SHALL write an audit log entry with actionType 'USER_SUSPENDED'.
5. WHEN the user is suspended, THE Team_Management_API SHALL return a 204 status code.
6. WHILE a user's status is 'suspended', THE Auth_System SHALL reject login attempts for that user with a 401 status code.

### Requirement 12: Dashboard Route Protection

**User Story:** As a platform operator, I want all dashboard routes to require authentication, so that unauthenticated users cannot access protected content.

#### Acceptance Criteria

1. THE Auth_Middleware SHALL intercept all requests to paths under /app/(dashboard)/*.
2. IF the request does not contain a valid Session_Cookie, THEN THE Auth_Middleware SHALL redirect the request to /login.
3. WHEN the Session_Cookie is valid, THE Auth_Middleware SHALL pass the user context (userId, tenantId, role, email) through to page components via a server-side session fetch.

### Requirement 13: Login Page

**User Story:** As a user, I want a login page with email and password fields, so that I can authenticate and access the platform.

#### Acceptance Criteria

1. THE Auth_System SHALL render a login form with email and password input fields.
2. THE Auth_System SHALL perform inline validation: the email field requires a valid email format, and the password field is required.
3. IF the login request fails, THEN THE Auth_System SHALL display an error toast with the error message.
4. THE Auth_System SHALL display a link to the registration page.
5. WHEN login succeeds, THE Auth_System SHALL redirect the user to the /recipes page.

### Requirement 14: Registration Page

**User Story:** As a new user, I want a registration page with email, password, and tenant name fields, so that I can create my account and organization.

#### Acceptance Criteria

1. THE Auth_System SHALL render a registration form with email, password, and tenant name input fields.
2. THE Auth_System SHALL enforce a minimum password length of 12 characters and display a password strength indicator.
3. THE Auth_System SHALL perform inline validation on all fields before submission.
4. WHEN registration succeeds, THE Auth_System SHALL redirect the user to the /recipes page.

### Requirement 15: Admin Team Management Page

**User Story:** As an admin, I want a team management page, so that I can view, invite, and manage team members from a single interface.

#### Acceptance Criteria

1. THE Auth_System SHALL render the team management page only for users with the 'admin' role.
2. IF a non-admin user navigates to the team management page, THEN THE Auth_System SHALL redirect the user to /runs.
3. THE Auth_System SHALL display a table of team members showing email, role badge, status, and last login date.
4. THE Auth_System SHALL provide an "Invite member" button that opens a modal with an email input and a role selector.
5. FOR EACH team member row, THE Auth_System SHALL provide a "Change role" dropdown and a "Remove" button with a confirmation dialog.
6. THE Auth_System SHALL display pending invitations in a separate table with a "Copy invite link" button for each invitation.

### Requirement 16: JWT Token Serialization (Round-Trip)

**User Story:** As a developer, I want JWT token signing and verification to be reliable, so that session data is faithfully preserved across the token lifecycle.

#### Acceptance Criteria

1. THE Auth_System SHALL sign JWT_Tokens using HS256 with the AUTH_JWT_SECRET environment variable.
2. THE Auth_System SHALL set JWT_Token expiry to 1 hour from signing.
3. FOR ALL valid JWT payloads containing userId, tenantId, role, and email, signing a JWT_Token and then verifying the JWT_Token SHALL produce a payload equivalent to the original input (round-trip property).
4. IF the AUTH_JWT_SECRET used for verification differs from the signing secret, THEN THE Auth_System SHALL reject the token as invalid.

### Requirement 17: DynamoDB Data Model

**User Story:** As a developer, I want a well-defined DynamoDB data model for users, email lookups, and invites, so that all auth and team operations use consistent key structures.

#### Acceptance Criteria

1. THE Auth_System SHALL store User_Records with PK=TENANT#{tenantId} and SK=USER#{userId}, containing fields: userId, tenantId, email, passwordHash, role (UserRole), createdAt, lastLoginAt, notificationPrefs (globalEnabled: boolean, workflowIds: string[] or 'all'), and status ('active', 'invited', or 'suspended').
2. THE Auth_System SHALL store Email_Index_Records with PK=EMAIL#{email} and SK=META, containing fields: userId and tenantId.
3. THE Auth_System SHALL store Invite_Records with PK=TENANT#{tenantId} and SK=INVITE#{inviteId}, containing fields: inviteId, email, role, invitedBy, createdAt, expiresAt, and accepted (boolean).
4. THE Auth_System SHALL use the Email_Index_Record to look up users by email without performing a table scan.

### Requirement 18: withAuth Unit Tests

**User Story:** As a developer, I want comprehensive unit tests for the auth middleware, so that authentication and authorization logic is verified.

#### Acceptance Criteria

1. WHEN a valid JWT_Token is present in the Session_Cookie, THE Auth_Middleware test SHALL verify that the handler is called with the correct user context (userId, tenantId, role, email).
2. WHEN the Session_Cookie is missing, THE Auth_Middleware test SHALL verify that a 401 status code is returned.
3. WHEN the JWT_Token is expired, THE Auth_Middleware test SHALL verify that a 401 status code is returned.
4. WHEN the user's role does not satisfy the requiredRole, THE Auth_Middleware test SHALL verify that a 403 status code is returned with the requiredRole in the response body.

---

## MVP Limitations

- Session invalidation on user suspension relies on JWT expiry (up to 1 hour). Immediate session revocation is deferred to a future iteration with a token blocklist.
- Email delivery for invitations is not implemented. The invite URL is returned directly in the API response.
- Password reset flow is not included in this iteration.
- Multi-factor authentication (MFA) is out of scope for MVP.
