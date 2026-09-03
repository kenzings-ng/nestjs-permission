import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

  /**
   * Registers a new permission name that can be assigned to roles and users.
   *
   * Throws ConflictException if a permission with this name already exists for the guard.
   */
  async createPermission(name: Permission): Promise<void> {
    if (await this.repository.permissionExists(name, this.guardName)) {
      throw new ConflictException(`Permission '${name}' already exists for guard '${this.guardName}'.`);
    }
    await this.repository.createPermission(name, this.guardName);
  }

  /**
   * Removes a permission definition and cascades the deletion to any role or user assignment
   * that references it.
   */
  deletePermission(name: Permission): Promise<void> {
    return this.repository.deletePermission(name, this.guardName);
  }

  /**
   * Registers a new role that permissions can be granted to and users can be assigned.
   *
   * Throws ConflictException if a role with this name already exists for the guard.
   */
  async createRole(name: string): Promise<void> {
    if (await this.repository.roleExists(name, this.guardName)) {
      throw new ConflictException(`Role '${name}' already exists for guard '${this.guardName}'.`);
    }
    await this.repository.createRole(name, this.guardName);
  }

  /**
   * Removes a role definition and cascades the deletion to any user-role assignment that
   * references it.
   */
  deleteRole(name: string): Promise<void> {
    return this.repository.deleteRole(name, this.guardName);
  }

  /**
   * Returns all defined permission names for this guard.
   *
   * Requires the underlying PermissionRepository to implement the optional listPermissions
   * method. Returns undefined when the repository does not support it.
   */
  listPermissions(): Promise<Permission[]> | undefined {
    return this.repository.listPermissions?.(this.guardName);
  }

  /**
   * Returns all defined role names for this guard.
   *
   * Requires the underlying PermissionRepository to implement the optional listRoles
   * method. Returns undefined when the repository does not support it.
   */
  listRoles(): Promise<string[]> | undefined {
    return this.repository.listRoles?.(this.guardName);
  }

  /**
   * Grants one or more permissions to a role. The role and every permission must already exist.
   * Uses the atomic addRolePermissions hook when the repository provides it; otherwise falls
   * back to a read-modify-write cycle.
   */
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

  /**
   * Replaces the complete set of permissions for a role. The role and every permission must
   * already exist. Permissions not listed are revoked.
   */
  async syncPermissions(role: string, permissions: Permission[]): Promise<void> {
    await this.assertRole(role);
    await this.assertPermissions(permissions);
    await this.repository.setRolePermissions(role, this.unique(permissions), this.guardName);
  }

  /**
   * Removes a single permission from a role. Uses the atomic removeRolePermissions hook when
   * the repository provides it; otherwise falls back to a read-modify-write cycle.
   */
  async revokePermissionFromRole(role: string, permission: Permission): Promise<void> {
    await this.assertRole(role);
    if (this.repository.removeRolePermissions) {
      await this.repository.removeRolePermissions(role, permission, this.guardName);
      return;
    }
    const current = await this.repository.getRolePermissions(role, this.guardName);
    await this.repository.setRolePermissions(role, current.filter((item) => item !== permission), this.guardName);
  }

  /** Returns all permissions currently granted to a role. */
  getRolePermissions(role: string): Promise<Permission[]> {
    return this.repository.getRolePermissions(role, this.guardName);
  }

  /**
   * Assigns one or more roles to a user. Every role must already exist. Uses the atomic
   * addUserRoles hook when the repository provides it; otherwise falls back to a
   * read-modify-write cycle. Tenant-scoped when called on a scoped service.
   */
  async assignRole(userId: PermissionSubjectId, ...roles: string[]): Promise<void> {
    await this.assertRoles(roles);
    if (this.repository.addUserRoles) {
      await this.repository.addUserRoles(userId, roles, this.guardName, this.tenantId);
      return;
    }
    const current = await this.repository.getUserRoles(userId, this.guardName, this.tenantId);
    await this.repository.setUserRoles(userId, this.unique([...current, ...roles]), this.guardName, this.tenantId);
  }

  /**
   * Replaces the complete set of roles for a user. Every role must already exist. Roles not
   * listed are removed. Tenant-scoped when called on a scoped service.
   */
  async syncRoles(userId: PermissionSubjectId, roles: string[]): Promise<void> {
    await this.assertRoles(roles);
    await this.repository.setUserRoles(userId, this.unique(roles), this.guardName, this.tenantId);
  }

  /**
   * Removes a single role from a user. Uses the atomic removeUserRoles hook when the
   * repository provides it; otherwise falls back to a read-modify-write cycle. Tenant-scoped
   * when called on a scoped service.
   */
  async removeRole(userId: PermissionSubjectId, role: string): Promise<void> {
    if (this.repository.removeUserRoles) {
      await this.repository.removeUserRoles(userId, role, this.guardName, this.tenantId);
      return;
    }
    const current = await this.repository.getUserRoles(userId, this.guardName, this.tenantId);
    await this.repository.setUserRoles(userId, current.filter((item) => item !== role), this.guardName, this.tenantId);
  }

  /** Returns all roles currently assigned to the user (in the current tenant scope). */
  getRoles(userId: PermissionSubjectId): Promise<string[]> {
    return this.repository.getUserRoles(userId, this.guardName, this.tenantId);
  }

  /**
   * Grants one or more permissions directly to a user (not through a role). Every permission
   * must already exist. Uses the atomic addUserPermissions hook when the repository provides
   * it; otherwise falls back to a read-modify-write cycle. Tenant-scoped when called on a
   * scoped service.
   */
  async givePermissionTo(userId: PermissionSubjectId, ...permissions: Permission[]): Promise<void> {
    await this.assertPermissions(permissions);
    if (this.repository.addUserPermissions) {
      await this.repository.addUserPermissions(userId, permissions, this.guardName, this.tenantId);
      return;
    }
    const current = await this.repository.getUserPermissions(userId, this.guardName, this.tenantId);
    await this.repository.setUserPermissions(userId, this.unique([...current, ...permissions]), this.guardName, this.tenantId);
  }

  /**
   * Replaces the complete set of direct permissions for a user. Every permission must already
   * exist. Permissions not listed are revoked. Does not affect role-inherited permissions.
   * Tenant-scoped when called on a scoped service.
   */
  async syncDirectPermissions(userId: PermissionSubjectId, permissions: Permission[]): Promise<void> {
    await this.assertPermissions(permissions);
    await this.repository.setUserPermissions(userId, this.unique(permissions), this.guardName, this.tenantId);
  }

  /**
   * Removes a single direct permission from a user. Uses the atomic removeUserPermissions
   * hook when the repository provides it; otherwise falls back to a read-modify-write cycle.
   * Tenant-scoped when called on a scoped service.
   */
  async revokePermissionTo(userId: PermissionSubjectId, permission: Permission): Promise<void> {
    if (this.repository.removeUserPermissions) {
      await this.repository.removeUserPermissions(userId, permission, this.guardName, this.tenantId);
      return;
    }
    const current = await this.repository.getUserPermissions(userId, this.guardName, this.tenantId);
    await this.repository.setUserPermissions(userId, current.filter((item) => item !== permission), this.guardName, this.tenantId);
  }

  /**
   * Returns only the permissions granted directly to the user (not inherited from roles).
   * Useful when distinguishing between direct and role-inherited permissions, for example in
   * admin UIs or audit logs. Tenant-scoped when called on a scoped service.
   */
  getDirectPermissions(userId: PermissionSubjectId): Promise<Permission[]> {
    return this.repository.getUserPermissions(userId, this.guardName, this.tenantId);
  }

  /**
   * Returns the combined set of permissions the user holds: direct permissions plus every
   * permission inherited from assigned roles. Duplicates are removed. Wildcards are not
   * expanded — the raw permission strings are returned. Tenant-scoped when called on a scoped
   * service.
   */
  async getAllPermissions(userId: PermissionSubjectId): Promise<Permission[]> {
    const [direct, roles] = await Promise.all([
      this.repository.getUserPermissions(userId, this.guardName, this.tenantId),
      this.repository.getUserRoles(userId, this.guardName, this.tenantId),
    ]);
    const inherited = await Promise.all(roles.map((role) => this.repository.getRolePermissions(role, this.guardName)));
    return this.unique([...direct, ...inherited.flat()]);
  }

  /**
   * Checks whether the user holds the given permission (direct or via a role), honoring
   * wildcard matching. Equivalent to hasAllPermissions(userId, permission).
   */
  async hasPermissionTo(userId: PermissionSubjectId, permission: Permission): Promise<boolean> {
    return this.hasAllPermissions(userId, permission);
  }

  /** Checks whether the user holds every given permission (direct or via a role), honoring wildcards. */
  async hasAllPermissions(userId: PermissionSubjectId, ...permissions: Permission[]): Promise<boolean> {
    if (!permissions.length) return false;
    const granted = await this.getAllPermissions(userId);
    return permissions.every((permission) => this.matchesAny(granted, permission));
  }

  /** Checks whether the user holds at least one of the given permissions (direct or via a role), honoring wildcards. */
  async hasAnyPermission(userId: PermissionSubjectId, ...permissions: Permission[]): Promise<boolean> {
    const granted = await this.getAllPermissions(userId);
    return permissions.some((permission) => this.matchesAny(granted, permission));
  }

  /** Checks whether the user has the given role assigned (exact match, no wildcards). */
  async hasRole(userId: PermissionSubjectId, role: string): Promise<boolean> {
    const roles = await this.getRoles(userId);
    return roles.includes(role);
  }

  /** Checks whether the user has every given role assigned (exact match, no wildcards). */
  async hasAllRoles(userId: PermissionSubjectId, ...roles: string[]): Promise<boolean> {
    if (!roles.length) return false;
    const assigned = await this.getRoles(userId);
    return roles.every((role) => assigned.includes(role));
  }

  /** Checks whether the user has at least one of the given roles assigned (exact match, no wildcards). */
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
