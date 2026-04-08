# Implementation Plan: Authentication, RBAC & Tenant Management

## Overview

Implement custom JWT-based authentication, three-tier RBAC (admin > builder > viewer), and multi-tenant team management for CourseForge Connect. Uses Next.js App Router, DynamoDB single-table design, jose for JWT, and bcrypt for password hashing. No third-party auth libraries.

## Tasks

- [x] 1. Core auth library: types, schema keys, and role hierarchy
  - [x] 1.1 Create auth types (`app/lib/auth/types.ts`)
    - Define `UserRole`, `UserStatus`, `UserRecord`, `EmailIndexRecord`, `InviteRecord`, `AuthContext`, `JWTPayload` interfaces
    - _Requirements: 17.1, 17.2, 17.3_
  - [x] 1.2 Extend DynamoDB schema keys (`src/models/schema.ts`)
    - Add `userSK(userId)`, `emailPK(email)`, `inviteSK(inviteId)` key builders
    - Add `KEY_PREFIX_AUTH` with `EMAIL` and `INVITE` prefixes
    - _Requirements: 17.1, 17.2, 17.3, 17.4_
  - [x] 1.3 Implement role hierarchy (`app/lib/auth/roles.ts`)
    - Define `ROLE_LEVEL` map and `hasRole(userRole, requiredRole)` function
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 1.4 Write property test for role hierarchy
    - **Property 2: Role hierarchy is a total order**
    - **Validates: Requirements 6.2, 6.3, 6.4, 5.4**

- [x] 2. JWT and password utilities
  - [x] 2.1 Implement JWT utilities (`app/lib/auth/jwt.ts`)
    - `signToken`, `verifyToken`, `setSessionCookie`, `clearSessionCookie` using jose HS256
    - 1-hour expiry, cookie name `courseforge_session`, HttpOnly, SameSite=Strict, Secure, Path=/
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
  - [x] 2.2 Implement password utilities (`app/lib/auth/password.ts`)
    - `hashPassword` (bcrypt, 12 rounds) and `verifyPassword` (bcrypt.compare)
    - _Requirements: 1.4_
  - [x] 2.3 Write property test for JWT round-trip
    - **Property 1: JWT sign/verify round-trip**
    - **Validates: Requirements 16.3**
  - [x] 2.4 Write property test for registration input validation
    - **Property 3: Registration input validation**
    - **Validates: Requirements 1.1, 1.2**

- [x] 3. Auth middleware (withAuth)
  - [x] 3.1 Implement withAuth middleware (`app/lib/auth/middleware.ts`)
    - Extract JWT from cookie, verify, check role hierarchy, attach AuthContext
    - Return 401 for missing/invalid/expired tokens, 403 for insufficient role
    - Export `requireAdmin`, `requireBuilder`, `requireViewer` convenience wrappers
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x] 3.2 Write property test for auth middleware correctness
    - **Property 6: Auth middleware correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.6**
  - [x] 3.3 Write unit tests for withAuth middleware (`app/lib/auth/middleware.test.ts`)
    - Test valid JWT → handler called with correct context
    - Test missing cookie → 401
    - Test expired token → 401
    - Test insufficient role → 403 with requiredRole in body
    - Test convenience wrappers (requireAdmin, requireBuilder, requireViewer)
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Auth API routes (register, login, logout, me)
  - [x] 5.1 Implement POST `/api/auth/register` (`app/api/auth/register/route.ts`)
    - Validate email format and password length (>= 12)
    - Check for duplicate email via EmailIndexRecord
    - Hash password, generate tenantId + userId UUIDs
    - Write Tenant record, UserRecord (role=admin, status=active), EmailIndexRecord
    - Call `bootstrapTenant`, sign JWT, set session cookie, return user data
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_
  - [x] 5.2 Implement POST `/api/auth/login` (`app/api/auth/login/route.ts`)
    - Look up EmailIndexRecord, fetch UserRecord, verify status=active, bcrypt.compare password
    - Return identical 401 `{ error: 'Invalid credentials' }` for all failure modes
    - On success: sign JWT, set cookie, update lastLoginAt, return user object
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 11.6_
  - [x] 5.3 Implement POST `/api/auth/logout` (`app/api/auth/logout/route.ts`)
    - Clear session cookie, return 204
    - _Requirements: 3.1, 3.2_
  - [x] 5.4 Implement GET `/api/auth/me` (`app/api/auth/me/route.ts`)
    - Use withAuth to verify JWT, return user object from token payload
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 5.5 Write property test for registration records
    - **Property 4: Registration creates correct DynamoDB records**
    - **Validates: Requirements 1.6, 17.1, 17.2**
  - [x] 5.6 Write property test for login failure indistinguishability
    - **Property 5: Login failure responses are indistinguishable**
    - **Validates: Requirements 2.4, 11.6**

- [x] 6. Team management API routes
  - [x] 6.1 Implement POST `/api/team/invite` (`app/api/team/invite/route.ts`)
    - Use requireAdmin, create InviteRecord with 48h expiry, return invite URL
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 6.2 Implement POST `/api/team/accept-invite` (`app/api/team/accept-invite/route.ts`)
    - Validate invite exists (404), not accepted (409), not expired (410)
    - Validate password, create UserRecord with invite's role, create EmailIndexRecord
    - Mark invite accepted, sign JWT, set cookie, return user data
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_
  - [x] 6.3 Implement GET `/api/team/members` (`app/api/team/members/route.ts`)
    - Use requireAdmin, query DynamoDB for SK begins_with USER#, return members array
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 6.4 Implement PATCH `/api/team/members/[userId]/role` (`app/api/team/members/[userId]/role/route.ts`)
    - Use requireAdmin, block self-demotion (422), update role, write audit log, return result
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 6.5 Implement POST `/api/team/members/[userId]/suspend` (`app/api/team/members/[userId]/suspend/route.ts`)
    - Use requireAdmin, block self-suspension (422), set status=suspended, write audit log, return 204
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [x] 6.6 Write property test for invite record creation
    - **Property 7: Invite record creation**
    - **Validates: Requirements 7.1, 7.5, 17.3**
  - [x] 6.7 Write property test for accept-invite role assignment
    - **Property 8: Accept-invite assigns the invite's role**
    - **Validates: Requirements 8.5**

- [x] 7. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Next.js middleware for dashboard route protection
  - [x] 8.1 Implement root-level middleware (`middleware.ts`)
    - Match `/(dashboard)/:path*` routes
    - Check for `courseforge_session` cookie and verify JWT validity
    - Redirect to `/login` if missing or invalid, pass through if valid
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 9. Frontend pages
  - [x] 9.1 Create login page (`app/(auth)/login/page.tsx`)
    - Email and password fields with inline validation
    - Error toast on failure, link to registration page
    - Redirect to /recipes on success
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - [x] 9.2 Create registration page (`app/(auth)/register/page.tsx`)
    - Email, password, and tenant name fields with inline validation
    - Password strength indicator, minimum 12 characters
    - Redirect to /recipes on success
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  - [x] 9.3 Create accept-invite page (`app/(auth)/accept-invite/page.tsx`)
    - Read token from query params, email and password fields
    - Handle error states (expired, already used, not found)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.8_
  - [x] 9.4 Create admin team management page (`app/(dashboard)/admin/team/page.tsx`)
    - Admin-only access, redirect non-admins to /runs
    - Members table with email, role badge, status, last login
    - Invite member button with modal (email + role selector)
    - Change role dropdown and Remove button with confirmation per member row
    - Pending invitations table with copy invite link button
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 10. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with `vitest` (already in devDependencies), minimum 100 iterations
- DynamoDB client is mocked for all unit and property tests
- JWT secret uses a test-only value for deterministic tests
