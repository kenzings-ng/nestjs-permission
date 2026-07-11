import { Permission } from './types';

export function matchesPermission(granted: Permission, requested: Permission, wildcard = true): boolean {
  if (granted === requested) return true;
  if (!wildcard) return false;
  if (granted === '*') return true;
  if (!granted.endsWith('.*')) return false;
  return requested.startsWith(granted.slice(0, -1));
}
