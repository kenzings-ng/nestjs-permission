export type Permission = string;
export type PermissionMatchMode = 'all' | 'any';
export type PermissionSubjectId = string | number;

export interface RequiredPermissions {
  permissions: Permission[];
  mode: PermissionMatchMode;
}

export interface PermissionUser {
  id?: PermissionSubjectId;
  permissions?: Iterable<Permission>;
}

export interface PermissionEvaluator {
  hasPermissions(user: PermissionUser | undefined, required: RequiredPermissions): boolean | Promise<boolean>;
}

export interface NestPermissionModuleOptions {
  /** Name of the authenticated user property on the request. Default: `user`. */
  userProperty?: string;
  /** Permission namespace for an authentication guard. Default: `default`. */
  guardName?: string;
  /** Enables `products.*` and `*` permission matching. Default: `true`. */
  wildcardPermissions?: boolean;
}

/** ORM-independent persistence contract. Implement this for Prisma, TypeORM, or Mongoose. */
export interface PermissionRepository {
  createPermission(name: Permission, guardName: string): Promise<void>;
  deletePermission(name: Permission, guardName: string): Promise<void>;
  createRole(name: string, guardName: string): Promise<void>;
  deleteRole(name: string, guardName: string): Promise<void>;
  permissionExists(name: Permission, guardName: string): Promise<boolean>;
  roleExists(name: string, guardName: string): Promise<boolean>;
  setRolePermissions(role: string, permissions: Permission[], guardName: string): Promise<void>;
  getRolePermissions(role: string, guardName: string): Promise<Permission[]>;
  setUserRoles(userId: PermissionSubjectId, roles: string[], guardName: string): Promise<void>;
  getUserRoles(userId: PermissionSubjectId, guardName: string): Promise<string[]>;
  setUserPermissions(userId: PermissionSubjectId, permissions: Permission[], guardName: string): Promise<void>;
  getUserPermissions(userId: PermissionSubjectId, guardName: string): Promise<Permission[]>;
}
