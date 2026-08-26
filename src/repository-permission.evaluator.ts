import { Inject, Injectable } from '@nestjs/common';
import { PERMISSION_OPTIONS } from './constants';
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
    const service = user.tenantId === undefined ? this.permissions : this.permissions.forTenant(user.tenantId);
    const granted = user.id === undefined
      ? new Set(user.permissions ?? [])
      : new Set(await service.getAllPermissions(user.id));
    const has = (permission: string) =>
      [...granted].some((value) => matchesPermission(value, permission, this.options.wildcardPermissions !== false));
    return required.mode === 'all'
      ? required.permissions.every(has)
      : required.permissions.some(has);
  }
}
