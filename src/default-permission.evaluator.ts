import { Inject, Injectable, Optional } from '@nestjs/common';
import { PERMISSION_OPTIONS } from './constants';
import { matchesPermission } from './permission-matcher';
import { NestPermissionModuleOptions, PermissionEvaluator, PermissionUser, RequiredPermissions } from './types';

/**
 * Evaluates the `permissions` collection attached to the authenticated user object.
 *
 * Supports wildcard permissions (`products.*`, `*`) when `wildcardPermissions` is enabled
 * (the default). Use this evaluator when you want to keep permission data on the user object
 * rather than querying a database on every request.
 */
@Injectable()
export class DefaultPermissionEvaluator implements PermissionEvaluator {
  constructor(
    @Optional() @Inject(PERMISSION_OPTIONS) private readonly options: NestPermissionModuleOptions | null = null,
  ) {}

  hasPermissions(user: PermissionUser | undefined, required: RequiredPermissions): boolean {
    if (!user?.permissions) return false;
    const granted = [...user.permissions];
    const wildcard = this.options?.wildcardPermissions !== false;
    const has = (permission: string) => granted.some((g) => matchesPermission(g, permission, wildcard));
    return required.mode === 'all'
      ? required.permissions.every(has)
      : required.permissions.some(has);
  }
}
