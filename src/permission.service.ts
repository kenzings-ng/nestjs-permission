import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSION_OPTIONS, PERMISSION_REPOSITORY } from './constants';
import { matchesPermission } from './permission-matcher';
import { NestPermissionModuleOptions, Permission, PermissionRepository, PermissionSubjectId } from './types';

@Injectable()
export class PermissionService {
  private readonly guardName: string;
  private tenantId?: string;

  constructor(
    @Inject(PERMISSION_REPOSITORY) private readonly repository: PermissionRepository,
    @Inject(PERMISSION_OPTIONS) private readonly options: NestPermissionModuleOptions,
  ) {
    this.guardName = options.guardName ?? 'default';
  }

  /**
   * Returns a service scoped to one tenant. User↔role and user↔permission assignments made
   * through the scoped service are stored and read for that tenant only; permission/role
   * definitions and role↔permission grants stay shared across tenants.
   * Pass `undefined` for the global (tenant-less) scope.
   */
  forTenant(tenantId: string | undefined): PermissionService {
    const scoped = new PermissionService(this.repository, this.options);
    scoped.tenantId = tenantId;
    return scoped;
  }

  createPermission(name: Permission): Promise<void> {
    return this.repository.createPermission(name, this.guardName);
  }

  deletePermission(name: Permission): Promise<void> {
    return this.repository.deletePermission(name, this.guardName);
  }

  createRole(name: string): Promise<void> {
    return this.repository.createRole(name, this.guardName);
  }

  deleteRole(name: string): Promise<void> {
    return this.repository.deleteRole(name, this.guardName);
  }

  async givePermissionToRole(role: string, ...permissions: Permission[]): Promise<void> {
    await this.assertRole(role);
    await this.assertPermissions(permissions);
    if (this.repository.addRolePermissions) {
      await this.repository.addRolePermissions(role, permissions, this.guardName);
      return;
    }
    const current = await this.repository.getRolePermissions(role, this.guardName);
    await this.repository.setRolePermissions(role, this.unique([...current, ...permissions]), this.guardName);
  }

  async syncPermissions(role: string, permissions: Permission[]): Promise<void> {
    await this.assertRole(role);
    await this.assertPermissions(permissions);
    await this.repository.setRolePermissions(role, this.unique(permissions), this.guardName);
  }

  async revokePermissionFromRole(role: string, permission: Permission): Promise<void> {
    await this.assertRole(role);
    if (this.repository.removeRolePermissions) {
      await this.repository.removeRolePermissions(role, permission, this.guardName);
      return;
    }
    const current = await this.repository.getRolePermissions(role, this.guardName);
    await this.repository.setRolePermissions(role, current.filter((item) => item !== permission), this.guardName);
  }

  getRolePermissions(role: string): Promise<Permission[]> {
    return this.repository.getRolePermissions(role, this.guardName);
  }

  async assignRole(userId: PermissionSubjectId, ...roles: string[]): Promise<void> {
    await this.assertRoles(roles);
    if (this.repository.addUserRoles) {
      await this.repository.addUserRoles(userId, roles, this.guardName, this.tenantId);
      return;
    }
    const current = await this.repository.getUserRoles(userId, this.guardName, this.tenantId);
    await this.repository.setUserRoles(userId, this.unique([...current, ...roles]), this.guardName, this.tenantId);
  }

  async syncRoles(userId: PermissionSubjectId, roles: string[]): Promise<void> {
    await this.assertRoles(roles);
    await this.repository.setUserRoles(userId, this.unique(roles), this.guardName, this.tenantId);
  }

  async removeRole(userId: PermissionSubjectId, role: string): Promise<void> {
    if (this.repository.removeUserRoles) {
      await this.repository.removeUserRoles(userId, role, this.guardName, this.tenantId);
      return;
    }
    const current = await this.repository.getUserRoles(userId, this.guardName, this.tenantId);
    await this.repository.setUserRoles(userId, current.filter((item) => item !== role), this.guardName, this.tenantId);
  }

  getRoles(userId: PermissionSubjectId): Promise<string[]> {
    return this.repository.getUserRoles(userId, this.guardName, this.tenantId);
  }

  async givePermissionTo(userId: PermissionSubjectId, ...permissions: Permission[]): Promise<void> {
    await this.assertPermissions(permissions);
    if (this.repository.addUserPermissions) {
      await this.repository.addUserPermissions(userId, permissions, this.guardName, this.tenantId);
      return;
    }
    const current = await this.repository.getUserPermissions(userId, this.guardName, this.tenantId);
    await this.repository.setUserPermissions(userId, this.unique([...current, ...permissions]), this.guardName, this.tenantId);
  }

  async syncDirectPermissions(userId: PermissionSubjectId, permissions: Permission[]): Promise<void> {
    await this.assertPermissions(permissions);
    await this.repository.setUserPermissions(userId, this.unique(permissions), this.guardName, this.tenantId);
  }

  async revokePermissionTo(userId: PermissionSubjectId, permission: Permission): Promise<void> {
    if (this.repository.removeUserPermissions) {
      await this.repository.removeUserPermissions(userId, permission, this.guardName, this.tenantId);
      return;
    }
    const current = await this.repository.getUserPermissions(userId, this.guardName, this.tenantId);
    await this.repository.setUserPermissions(userId, current.filter((item) => item !== permission), this.guardName, this.tenantId);
  }

  async getAllPermissions(userId: PermissionSubjectId): Promise<Permission[]> {
    const [direct, roles] = await Promise.all([
      this.repository.getUserPermissions(userId, this.guardName, this.tenantId),
      this.repository.getUserRoles(userId, this.guardName, this.tenantId),
    ]);
    const inherited = await Promise.all(roles.map((role) => this.repository.getRolePermissions(role, this.guardName)));
    return this.unique([...direct, ...inherited.flat()]);
  }

  async hasPermissionTo(userId: PermissionSubjectId, permission: Permission): Promise<boolean> {
    return this.hasAllPermissions(userId, permission);
  }

  /** Checks whether the user holds every given permission (direct or via a role), honoring wildcards. */
  async hasAllPermissions(userId: PermissionSubjectId, ...permissions: Permission[]): Promise<boolean> {
    const granted = await this.getAllPermissions(userId);
    return permissions.every((permission) => this.matchesAny(granted, permission));
  }

  /** Checks whether the user holds at least one of the given permissions (direct or via a role), honoring wildcards. */
  async hasAnyPermission(userId: PermissionSubjectId, ...permissions: Permission[]): Promise<boolean> {
    const granted = await this.getAllPermissions(userId);
    return permissions.some((permission) => this.matchesAny(granted, permission));
  }

  /** Checks whether the user has the given role assigned. */
  async hasRole(userId: PermissionSubjectId, role: string): Promise<boolean> {
    const roles = await this.getRoles(userId);
    return roles.includes(role);
  }

  /** Checks whether the user has every given role assigned. */
  async hasAllRoles(userId: PermissionSubjectId, ...roles: string[]): Promise<boolean> {
    const assigned = await this.getRoles(userId);
    return roles.every((role) => assigned.includes(role));
  }

  /** Checks whether the user has at least one of the given roles assigned. */
  async hasAnyRole(userId: PermissionSubjectId, ...roles: string[]): Promise<boolean> {
    const assigned = await this.getRoles(userId);
    return roles.some((role) => assigned.includes(role));
  }

  private matchesAny(granted: Permission[], permission: Permission): boolean {
    return granted.some((item) => matchesPermission(item, permission, this.options.wildcardPermissions !== false));
  }

  private async assertRole(role: string): Promise<void> {
    if (!(await this.repository.roleExists(role, this.guardName))) {
      throw new NotFoundException(`Role '${role}' does not exist for guard '${this.guardName}'.`);
    }
  }

  private async assertRoles(roles: string[]): Promise<void> {
    await Promise.all(roles.map((role) => this.assertRole(role)));
  }

  private async assertPermissions(permissions: Permission[]): Promise<void> {
    await Promise.all(
      permissions.map(async (permission) => {
        if (!(await this.repository.permissionExists(permission, this.guardName))) {
          throw new NotFoundException(`Permission '${permission}' does not exist for guard '${this.guardName}'.`);
        }
      }),
    );
  }

  private unique<T>(items: T[]): T[] {
    return [...new Set(items)];
  }
}
