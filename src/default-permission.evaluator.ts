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
    @Optional() @Inject(PERMISSION_OPTIONS) private readonly options: NestPermissionModuleOptions = {},
  ) {}

  hasPermissions(user: PermissionUser | undefined, required: RequiredPermissions): boolean {
    if (!user?.permissions) return false;
    if (!required.permissions.length) return false;
    const granted = new Set(user.permissions);
    const has = (permission: string) =>
      [...granted].some((value) => matchesPermission(value, permission, this.options.wildcardPermissions !== false));
    return required.mode === 'all'
      ? required.permissions.every(has)
      : required.permissions.some(has);
  }
}
