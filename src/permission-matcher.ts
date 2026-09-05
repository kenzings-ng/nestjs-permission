import { isPermissionString } from './permission-input';
import { Permission } from './types';

export function matchesPermission(granted: Permission, requested: Permission, wildcard = true): boolean {
  // A non-string operand cannot be compared safely and must never widen a match. Reachable at
  // runtime because `granted` originates from the authenticated user object.
  if (!isPermissionString(granted) || !isPermissionString(requested)) return false;
  if (granted === requested) return true;
  if (!wildcard) return false;
  if (granted === '*') return true;
  if (!granted.endsWith('.*')) return false;
  return requested.startsWith(granted.slice(0, -1));
}
