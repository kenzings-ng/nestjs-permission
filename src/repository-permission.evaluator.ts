import { Inject, Injectable } from '@nestjs/common';
import { PERMISSION_OPTIONS } from './constants';
import { isPermissionString, isSubjectId, toPermissionSet } from './permission-input';
import { matchesPermission } from './permission-matcher';
import { PermissionService } from './permission.service';
import { NestPermissionModuleOptions, PermissionEvaluator, PermissionUser, RequiredPermissions } from './types';

@Injectable()
export class RepositoryPermissionEvaluator implements PermissionEvaluator {
  constructor(
    private readonly permissions: PermissionService,
    @Inject(PERMISSION_OPTIONS) private readonly options: NestPermissionModuleOptions,
  ) {}

  async hasPermissions(user: PermissionUser | undefined, required: RequiredPermissions): Promise<boolean> {
    if (!user) return false;
    if (!required.permissions.length) return false;

    // `tenantId` and `id` come off the request user object and are used as persistence filter
    // values. Deny rather than throw so a malformed claim can never widen the tenant scope.
    const tenantId = user.tenantId;
    if (tenantId !== undefined && !isPermissionString(tenantId)) return false;
    if (user.id !== undefined && !isSubjectId(user.id)) return false;

    const service = tenantId === undefined ? this.permissions : this.permissions.forTenant(tenantId);
    const granted = user.id === undefined
      ? toPermissionSet(user.permissions)
      : toPermissionSet(await service.getAllPermissions(user.id));
    const has = (permission: string) =>
      [...granted].some((value) => matchesPermission(value, permission, this.options.wildcardPermissions !== false));
    return required.mode === 'all'
      ? required.permissions.every(has)
      : required.permissions.some(has);
  }
}
