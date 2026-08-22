import { NonEmptyPermissions, Permission } from './types';

export function assertNonEmptyPermissions(
  permissions: Permission[],
  source = 'Permission metadata',
): asserts permissions is NonEmptyPermissions {
  if (!permissions.length) {
    throw new Error(`${source} requires at least one permission.`);
  }
}
