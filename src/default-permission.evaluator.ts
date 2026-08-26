import { Inject, Injectable, Optional } from '@nestjs/common';
import { PERMISSION_OPTIONS } from './constants';
import { matchesPermission } from './permission-matcher';
import { NestPermissionModuleOptions, PermissionEvaluator, PermissionUser, RequiredPermissions } from './types';

/** Evaluates the `permissions` collection attached to the authenticated user. */
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
