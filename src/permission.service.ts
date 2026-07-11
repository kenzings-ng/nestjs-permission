import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSION_OPTIONS, PERMISSION_REPOSITORY } from './constants';
import { matchesPermission } from './permission-matcher';
import { NestPermissionModuleOptions, Permission, PermissionRepository, PermissionSubjectId } from './types';

@Injectable()
export class PermissionService {
  private readonly guardName: string;

  constructor(
    @Inject(PERMISSION_REPOSITORY) private readonly repository: PermissionRepository,
    @Inject(PERMISSION_OPTIONS) private readonly options: NestPermissionModuleOptions,
  ) {
    this.guardName = options.guardName ?? 'default';
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
    const current = await this.repository.getRolePermissions(role, this.guardName);
    await this.repository.setRolePermissions(role, current.filter((item) => item !== permission), this.guardName);
  }

  getRolePermissions(role: string): Promise<Permission[]> {
    return this.repository.getRolePermissions(role, this.guardName);
  }

  async assignRole(userId: PermissionSubjectId, ...roles: string[]): Promise<void> {
    await this.assertRoles(roles);
    const current = await this.repository.getUserRoles(userId, this.guardName);
    await this.repository.setUserRoles(userId, this.unique([...current, ...roles]), this.guardName);
  }

  async syncRoles(userId: PermissionSubjectId, roles: string[]): Promise<void> {
    await this.assertRoles(roles);
    await this.repository.setUserRoles(userId, this.unique(roles), this.guardName);
  }

  async removeRole(userId: PermissionSubjectId, role: string): Promise<void> {
    const current = await this.repository.getUserRoles(userId, this.guardName);
    await this.repository.setUserRoles(userId, current.filter((item) => item !== role), this.guardName);
  }

  getRoles(userId: PermissionSubjectId): Promise<string[]> {
    return this.repository.getUserRoles(userId, this.guardName);
  }

  async givePermissionTo(userId: PermissionSubjectId, ...permissions: Permission[]): Promise<void> {
    await this.assertPermissions(permissions);
    const current = await this.repository.getUserPermissions(userId, this.guardName);
    await this.repository.setUserPermissions(userId, this.unique([...current, ...permissions]), this.guardName);
  }

  async syncDirectPermissions(userId: PermissionSubjectId, permissions: Permission[]): Promise<void> {
    await this.assertPermissions(permissions);
    await this.repository.setUserPermissions(userId, this.unique(permissions), this.guardName);
  }

  async revokePermissionTo(userId: PermissionSubjectId, permission: Permission): Promise<void> {
    const current = await this.repository.getUserPermissions(userId, this.guardName);
    await this.repository.setUserPermissions(userId, current.filter((item) => item !== permission), this.guardName);
  }

  async getAllPermissions(userId: PermissionSubjectId): Promise<Permission[]> {
    const [direct, roles] = await Promise.all([
      this.repository.getUserPermissions(userId, this.guardName),
      this.repository.getUserRoles(userId, this.guardName),
    ]);
    const inherited = await Promise.all(roles.map((role) => this.repository.getRolePermissions(role, this.guardName)));
    return this.unique([...direct, ...inherited.flat()]);
  }

  async hasPermissionTo(userId: PermissionSubjectId, permission: Permission): Promise<boolean> {
    const permissions = await this.getAllPermissions(userId);
    return permissions.some((granted) => matchesPermission(granted, permission, this.options.wildcardPermissions !== false));
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
