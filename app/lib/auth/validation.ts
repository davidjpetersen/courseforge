/**
 * Registration input validation for CourseForge Connect
 *
 * Validates email format and password length requirements.
 */

/**
 * Standard email format regex.
 * Checks for: local-part@domain with at least one dot in domain.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_PASSWORD_LENGTH = 12;

/**
 * Validate that a string conforms to a standard email format.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/**
 * Validate that a password meets the minimum length requirement (>= 12 chars).
 */
export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export { MIN_PASSWORD_LENGTH };
