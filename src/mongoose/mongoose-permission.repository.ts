import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  assertOptionalTenantId,
  assertPermissionString,
  assertPermissionStrings,
  assertSubjectId,
} from '../permission-input';
import { Permission, PermissionRepository, PermissionSubjectId } from '../types';
import {
  NamedDocument,
  PERMISSION_MODEL,
  ROLE_MODEL,
  ROLE_PERMISSION_MODEL,
  RolePermissionDocument,
  USER_PERMISSION_MODEL,
  USER_ROLE_MODEL,
  UserPermissionDocument,
  UserRoleDocument,
} from './mongoose-permission.schemas';

/** MongoDB adapter using separate relation collections, mirroring Spatie's pivot tables. */
@Injectable()
export class MongoosePermissionRepository implements PermissionRepository {
  constructor(
    @InjectModel(PERMISSION_MODEL) private readonly permissions: Model<NamedDocument>,
    @InjectModel(ROLE_MODEL) private readonly roles: Model<NamedDocument>,
    @InjectModel(ROLE_PERMISSION_MODEL) private readonly rolePermissions: Model<RolePermissionDocument>,
    @InjectModel(USER_ROLE_MODEL) private readonly userRoles: Model<UserRoleDocument>,
    @InjectModel(USER_PERMISSION_MODEL) private readonly userPermissions: Model<UserPermissionDocument>,
  ) {}

  async createPermission(name: Permission, guardName: string): Promise<void> {
    this.assertName(name, guardName, 'permission');
    await this.permissions.updateOne({ name, guardName }, { $setOnInsert: { name, guardName } }, { upsert: true });
  }

  async deletePermission(name: Permission, guardName: string): Promise<void> {
    this.assertName(name, guardName, 'permission');
    await this.runInTransaction(async (session) => {
      const permission = await this.permissions.findOneAndDelete({ name, guardName }).session(session).lean();
      if (!permission) return;
      await this.rolePermissions.deleteMany({ permissionId: permission._id, guardName }).session(session);
      await this.userPermissions.deleteMany({ permissionId: permission._id, guardName }).session(session);
    });
  }

  async createRole(name: string, guardName: string): Promise<void> {
    this.assertName(name, guardName, 'role');
    await this.roles.updateOne({ name, guardName }, { $setOnInsert: { name, guardName } }, { upsert: true });
  }

  async deleteRole(name: string, guardName: string): Promise<void> {
    this.assertName(name, guardName, 'role');
    await this.runInTransaction(async (session) => {
      const role = await this.roles.findOneAndDelete({ name, guardName }).session(session).lean();
      if (!role) return;
      await this.rolePermissions.deleteMany({ roleId: role._id, guardName }).session(session);
      await this.userRoles.deleteMany({ roleId: role._id, guardName }).session(session);
    });
  }

  async permissionExists(name: Permission, guardName: string): Promise<boolean> {
    this.assertName(name, guardName, 'permission');
    return (await this.permissions.exists({ name, guardName })) !== null;
  }

  async roleExists(name: string, guardName: string): Promise<boolean> {
    this.assertName(name, guardName, 'role');
    return (await this.roles.exists({ name, guardName })) !== null;
  }

  async setRolePermissions(role: string, permissions: Permission[], guardName: string): Promise<void> {
    this.assertName(role, guardName, 'role');
    assertPermissionStrings(permissions, 'permission');
    await this.runInTransaction(async (session) => {
      const roleDocument = await this.findRole(role, guardName, session);
      const permissionDocuments = await this.findPermissions(permissions, guardName, session);
      await this.rolePermissions.deleteMany({ roleId: roleDocument._id, guardName }).session(session);
      if (permissionDocuments.length) {
        await this.rolePermissions.insertMany(
          permissionDocuments.map((permission) => ({
            roleId: roleDocument._id,
            permissionId: permission._id,
            guardName,
          })),
          { session },
        );
      }
    });
  }

  async getRolePermissions(role: string, guardName: string): Promise<Permission[]> {
    this.assertName(role, guardName, 'role');
    const roleDocument = await this.findRole(role, guardName);
    const relations = await this.rolePermissions.find({ roleId: roleDocument._id, guardName }).lean();
    const ids = relations.map((relation) => relation.permissionId);
    const permissions = await this.permissions.find({ _id: { $in: ids }, guardName }).lean();
    return permissions.map((permission) => permission.name);
  }

  async setUserRoles(userId: PermissionSubjectId, roles: string[], guardName: string, tenantId?: string): Promise<void> {
    this.assertSubject(userId, guardName, tenantId);
    assertPermissionStrings(roles, 'role');
    const subjectId = String(userId);
    await this.runInTransaction(async (session) => {
      const roleDocuments = await this.findRoles(roles, guardName, session);
      await this.userRoles.deleteMany({ subjectId, guardName, ...this.tenantFilter(tenantId) }).session(session);
      if (roleDocuments.length) {
        await this.userRoles.insertMany(
          roleDocuments.map((role) => ({ subjectId, roleId: role._id, guardName, ...this.tenantFields(tenantId) })),
          { session },
        );
      }
    });
  }

  async getUserRoles(userId: PermissionSubjectId, guardName: string, tenantId?: string): Promise<string[]> {
    this.assertSubject(userId, guardName, tenantId);
    const relations = await this.userRoles.find({ subjectId: String(userId), guardName, ...this.tenantFilter(tenantId) }).lean();
    const roles = await this.roles.find({ _id: { $in: relations.map((relation) => relation.roleId) }, guardName }).lean();
    return roles.map((role) => role.name);
  }

  async setUserPermissions(userId: PermissionSubjectId, permissions: Permission[], guardName: string, tenantId?: string): Promise<void> {
    this.assertSubject(userId, guardName, tenantId);
    assertPermissionStrings(permissions, 'permission');
    const subjectId = String(userId);
    await this.runInTransaction(async (session) => {
      const permissionDocuments = await this.findPermissions(permissions, guardName, session);
      await this.userPermissions.deleteMany({ subjectId, guardName, ...this.tenantFilter(tenantId) }).session(session);
      if (permissionDocuments.length) {
        await this.userPermissions.insertMany(
          permissionDocuments.map((permission) => ({
            subjectId,
            permissionId: permission._id,
            guardName,
            ...this.tenantFields(tenantId),
          })),
          { session },
        );
      }
    });
  }

  async getUserPermissions(userId: PermissionSubjectId, guardName: string, tenantId?: string): Promise<Permission[]> {
    this.assertSubject(userId, guardName, tenantId);
    const relations = await this.userPermissions.find({ subjectId: String(userId), guardName, ...this.tenantFilter(tenantId) }).lean();
    const permissions = await this.permissions.find({ _id: { $in: relations.map((relation) => relation.permissionId) }, guardName }).lean();
    return permissions.map((permission) => permission.name);
  }

  async addRolePermissions(role: string, permissions: Permission[], guardName: string): Promise<void> {
    this.assertName(role, guardName, 'role');
    assertPermissionStrings(permissions, 'permission');
    if (!permissions.length) return;
    await this.runInTransaction(async (session) => {
      const roleDocument = await this.findRole(role, guardName, session);
      const permissionDocuments = await this.findPermissions(permissions, guardName, session);
      if (!permissionDocuments.length) return;
      await this.rolePermissions.bulkWrite(permissionDocuments.map((permission) => {
        const relation = { roleId: roleDocument._id, permissionId: permission._id, guardName };
        return { updateOne: { filter: relation, update: { $setOnInsert: relation }, upsert: true } };
      }), { ordered: false, session });
    });
  }

  async removeRolePermissions(role: string, permission: Permission, guardName: string): Promise<void> {
    this.assertName(role, guardName, 'role');
    assertPermissionString(permission, 'permission');
    const roleDocument = await this.findRole(role, guardName);
    const permissionDocument = await this.permissions.findOne({ name: permission, guardName }).lean();
    if (!permissionDocument) return;
    await this.rolePermissions.deleteMany({ roleId: roleDocument._id, permissionId: permissionDocument._id, guardName });
  }

  async addUserRoles(userId: PermissionSubjectId, roles: string[], guardName: string, tenantId?: string): Promise<void> {
    this.assertSubject(userId, guardName, tenantId);
    assertPermissionStrings(roles, 'role');
    if (!roles.length) return;
    const subjectId = String(userId);
    await this.runInTransaction(async (session) => {
      const roleDocuments = await this.findRoles(roles, guardName, session);
      if (!roleDocuments.length) return;
      await this.userRoles.bulkWrite(roleDocuments.map((role) => {
        const relation = { subjectId, roleId: role._id, guardName, ...this.tenantFields(tenantId) };
        const filter = { subjectId, roleId: role._id, guardName, ...this.tenantFilter(tenantId) };
        return { updateOne: { filter, update: { $setOnInsert: relation }, upsert: true } };
      }), { ordered: false, session });
    });
  }

  async removeUserRoles(userId: PermissionSubjectId, role: string, guardName: string, tenantId?: string): Promise<void> {
    this.assertSubject(userId, guardName, tenantId);
    assertPermissionString(role, 'role');
    const roleDocument = await this.roles.findOne({ name: role, guardName }).lean();
    const subjectId = String(userId);
    if (!roleDocument) return;
    await this.userRoles.deleteMany({ subjectId, roleId: roleDocument._id, guardName, ...this.tenantFilter(tenantId) });
  }

  async addUserPermissions(userId: PermissionSubjectId, permissions: Permission[], guardName: string, tenantId?: string): Promise<void> {
    this.assertSubject(userId, guardName, tenantId);
    assertPermissionStrings(permissions, 'permission');
    if (!permissions.length) return;
    const subjectId = String(userId);
    await this.runInTransaction(async (session) => {
      const permissionDocuments = await this.findPermissions(permissions, guardName, session);
      if (!permissionDocuments.length) return;
      await this.userPermissions.bulkWrite(permissionDocuments.map((permission) => {
        const relation = { subjectId, permissionId: permission._id, guardName, ...this.tenantFields(tenantId) };
        const filter = { subjectId, permissionId: permission._id, guardName, ...this.tenantFilter(tenantId) };
        return { updateOne: { filter, update: { $setOnInsert: relation }, upsert: true } };
      }), { ordered: false, session });
    });
  }

  async removeUserPermissions(userId: PermissionSubjectId, permission: Permission, guardName: string, tenantId?: string): Promise<void> {
    this.assertSubject(userId, guardName, tenantId);
    assertPermissionString(permission, 'permission');
    const permissionDocument = await this.permissions.findOne({ name: permission, guardName }).lean();
    const subjectId = String(userId);
    if (!permissionDocument) return;
    await this.userPermissions.deleteMany({ subjectId, permissionId: permissionDocument._id, guardName, ...this.tenantFilter(tenantId) });
  }

  async listPermissions(guardName: string): Promise<Permission[]> {
    assertPermissionString(guardName, 'guardName');
    const docs = await this.permissions.find({ guardName }, { name: 1 }).lean();
    return docs.map((doc) => doc.name);
  }

  async listRoles(guardName: string): Promise<string[]> {
    assertPermissionString(guardName, 'guardName');
    const docs = await this.roles.find({ guardName }, { name: 1 }).lean();
    return docs.map((doc) => doc.name);
  }

  /**
   * Rejects filter values MongoDB would read as query operators. `{ $ne: null }` in `name` turns
   * an existence check into "any document"; in `tenantId` it turns a tenant-scoped read into a
   * cross-tenant read.
   */
  private assertName(name: unknown, guardName: unknown, label: string): void {
    assertPermissionString(name, label);
    assertPermissionString(guardName, 'guardName');
  }

  private assertSubject(userId: unknown, guardName: unknown, tenantId: unknown): void {
    assertSubjectId(userId);
    assertPermissionString(guardName, 'guardName');
    assertOptionalTenantId(tenantId);
  }

  /** Filter matching one tenant's assignments; `undefined` matches only tenant-less documents. */
  private tenantFilter(tenantId?: string): Record<string, unknown> {
    return tenantId === undefined ? { tenantId: null } : { tenantId };
  }

  private tenantFields(tenantId?: string): Record<string, unknown> {
    return tenantId === undefined ? {} : { tenantId };
  }

  private async runInTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.rolePermissions.db.startSession();
    try {
      return await session.withTransaction(() => operation(session));
    } finally {
      await session.endSession();
    }
  }

  private async findRole(name: string, guardName: string, session?: ClientSession): Promise<NamedDocument> {
    if (session) {
      await this.roles.updateOne(
        { name, guardName },
        { $inc: { relationRevision: 1 } },
        { session },
      );
    }
    const query = this.roles.findOne({ name, guardName });
    if (session) query.session(session);
    const role = await query.lean();
    if (!role) throw new Error(`Role '${name}' was not found.`);
    return role;
  }

  private async findRoles(names: string[], guardName: string, session?: ClientSession): Promise<NamedDocument[]> {
    if (!names.length) return [];
    const filter = { name: { $in: names }, guardName };
    if (session) {
      await this.roles.updateMany(filter, { $inc: { relationRevision: 1 } }, { session });
    }
    const query = this.roles.find(filter);
    if (session) query.session(session);
    return query.lean();
  }

  private async findPermissions(names: string[], guardName: string, session?: ClientSession): Promise<NamedDocument[]> {
    if (!names.length) return [];
    const filter = { name: { $in: names }, guardName };
    if (session) {
      await this.permissions.updateMany(filter, { $inc: { relationRevision: 1 } }, { session });
    }
    const query = this.permissions.find(filter);
    if (session) query.session(session);
    return query.lean();
  }
}
