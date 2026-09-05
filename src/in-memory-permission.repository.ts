import { Injectable } from '@nestjs/common';
import {
  assertOptionalTenantId,
  assertPermissionString,
  assertPermissionStrings,
  assertSubjectId,
} from './permission-input';
import { Permission, PermissionRepository, PermissionSubjectId } from './types';

@Injectable()
export class InMemoryPermissionRepository implements PermissionRepository {
  private readonly permissions = new Set<string>();
  private readonly roles = new Set<string>();
  private readonly rolePermissions = new Map<string, Permission[]>();
  private readonly userRoles = new Map<string, string[]>();
  private readonly userPermissions = new Map<string, Permission[]>();

  async createPermission(name: Permission, guardName: string): Promise<void> {
    this.permissions.add(this.key(guardName, name));
  }

  async deletePermission(name: Permission, guardName: string): Promise<void> {
    this.permissions.delete(this.key(guardName, name));
    for (const [role, permissions] of this.rolePermissions) {
      if (this.belongsToGuard(role, guardName)) {
        this.rolePermissions.set(role, permissions.filter((permission) => permission !== name));
      }
    }
    for (const [user, permissions] of this.userPermissions) {
      if (this.belongsToGuard(user, guardName)) {
        this.userPermissions.set(user, permissions.filter((permission) => permission !== name));
      }
    }
  }

  async createRole(name: string, guardName: string): Promise<void> {
    this.roles.add(this.key(guardName, name));
  }

  async deleteRole(name: string, guardName: string): Promise<void> {
    const key = this.key(guardName, name);
    this.roles.delete(key);
    this.rolePermissions.delete(key);
    for (const [user, roles] of this.userRoles) {
      if (this.belongsToGuard(user, guardName)) {
        this.userRoles.set(user, roles.filter((role) => role !== name));
      }
    }
  }

  async permissionExists(name: Permission, guardName: string): Promise<boolean> {
    return this.permissions.has(this.key(guardName, name));
  }

  async roleExists(name: string, guardName: string): Promise<boolean> {
    return this.roles.has(this.key(guardName, name));
  }

  async setRolePermissions(role: string, permissions: Permission[], guardName: string): Promise<void> {
    assertPermissionStrings(permissions, 'permission');
    this.rolePermissions.set(this.key(guardName, role), [...new Set(permissions)]);
  }

  async getRolePermissions(role: string, guardName: string): Promise<Permission[]> {
    return [...(this.rolePermissions.get(this.key(guardName, role)) ?? [])];
  }

  async setUserRoles(userId: PermissionSubjectId, roles: string[], guardName: string, tenantId?: string): Promise<void> {
    assertPermissionStrings(roles, 'role');
    this.userRoles.set(this.userKey(guardName, userId, tenantId), [...new Set(roles)]);
  }

  async getUserRoles(userId: PermissionSubjectId, guardName: string, tenantId?: string): Promise<string[]> {
    return [...(this.userRoles.get(this.userKey(guardName, userId, tenantId)) ?? [])];
  }

  async setUserPermissions(userId: PermissionSubjectId, permissions: Permission[], guardName: string, tenantId?: string): Promise<void> {
    assertPermissionStrings(permissions, 'permission');
    this.userPermissions.set(this.userKey(guardName, userId, tenantId), [...new Set(permissions)]);
  }

  async getUserPermissions(userId: PermissionSubjectId, guardName: string, tenantId?: string): Promise<Permission[]> {
    return [...(this.userPermissions.get(this.userKey(guardName, userId, tenantId)) ?? [])];
  }

  async listPermissions(guardName: string): Promise<Permission[]> {
    assertPermissionString(guardName, 'guardName');
    const result: Permission[] = [];
    for (const key of this.permissions) {
      const [g, name] = JSON.parse(key) as [string, string];
      if (g === guardName) result.push(name);
    }
    return result;
  }

  async listRoles(guardName: string): Promise<string[]> {
    assertPermissionString(guardName, 'guardName');
    const result: string[] = [];
    for (const key of this.roles) {
      const [g, name] = JSON.parse(key) as [string, string];
      if (g === guardName) result.push(name);
    }
    return result;
  }

  /**
   * Validated here as well as in PermissionService so both adapters reject the same inputs. A
   * non-string name would otherwise key an entry that no later lookup can reproduce, and
   * `String({})` collapses every object-valued subject id onto `'[object Object]'`.
   */
  private key(guardName: string, name: string): string {
    assertPermissionString(guardName, 'guardName');
    assertPermissionString(name, 'name');
    return JSON.stringify([guardName, name]);
  }

  private userKey(guardName: string, userId: PermissionSubjectId, tenantId?: string): string {
    assertPermissionString(guardName, 'guardName');
    assertSubjectId(userId);
    assertOptionalTenantId(tenantId);
    const tenantScope = tenantId === undefined ? ['global'] : ['tenant', tenantId];
    return JSON.stringify([guardName, tenantScope, String(userId)]);
  }

  private belongsToGuard(key: string, guardName: string): boolean {
    const tuple = JSON.parse(key) as unknown[];
    return tuple[0] === guardName;
  }
}

