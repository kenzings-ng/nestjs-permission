import { Injectable } from '@nestjs/common';
import { PermissionEvaluator, PermissionUser, RequiredPermissions } from './types';

/** Evaluates the `permissions` collection attached to the authenticated user. */
@Injectable()
export class DefaultPermissionEvaluator implements PermissionEvaluator {
  hasPermissions(user: PermissionUser | undefined, required: RequiredPermissions): boolean {
    if (!user?.permissions) return false;
    const granted = new Set(user.permissions);
    return required.mode === 'all'
      ? required.permissions.every((permission) => granted.has(permission))
      : required.permissions.some((permission) => granted.has(permission));
  }
}
