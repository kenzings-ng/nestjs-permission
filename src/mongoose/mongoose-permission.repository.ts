import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
    await this.permissions.updateOne({ name, guardName }, { $setOnInsert: { name, guardName } }, { upsert: true });
  }

  async deletePermission(name: Permission, guardName: string): Promise<void> {
    const permission = await this.permissions.findOneAndDelete({ name, guardName }).lean();
    if (!permission) return;
    await Promise.all([
      this.rolePermissions.deleteMany({ permissionId: permission._id, guardName }),
      this.userPermissions.deleteMany({ permissionId: permission._id, guardName }),
    ]);
  }

  async createRole(name: string, guardName: string): Promise<void> {
    await this.roles.updateOne({ name, guardName }, { $setOnInsert: { name, guardName } }, { upsert: true });
  }

  async deleteRole(name: string, guardName: string): Promise<void> {
    const role = await this.roles.findOneAndDelete({ name, guardName }).lean();
    if (!role) return;
    await Promise.all([
      this.rolePermissions.deleteMany({ roleId: role._id, guardName }),
      this.userRoles.deleteMany({ roleId: role._id, guardName }),
    ]);
  }

  async permissionExists(name: Permission, guardName: string): Promise<boolean> {
    return (await this.permissions.exists({ name, guardName })) !== null;
  }

  async roleExists(name: string, guardName: string): Promise<boolean> {
    return (await this.roles.exists({ name, guardName })) !== null;
  }

  async setRolePermissions(role: string, permissions: Permission[], guardName: string): Promise<void> {
    const roleDocument = await this.findRole(role, guardName);
    const permissionDocuments = await this.findPermissions(permissions, guardName);
    await this.rolePermissions.deleteMany({ roleId: roleDocument._id, guardName });
    if (permissionDocuments.length) {
      await this.rolePermissions.insertMany(permissionDocuments.map((permission) => ({
        roleId: roleDocument._id,
        permissionId: permission._id,
        guardName,
      })));
    }
  }

  async getRolePermissions(role: string, guardName: string): Promise<Permission[]> {
    const roleDocument = await this.findRole(role, guardName);
    const relations = await this.rolePermissions.find({ roleId: roleDocument._id, guardName }).lean();
    const ids = relations.map((relation) => relation.permissionId);
    const permissions = await this.permissions.find({ _id: { $in: ids }, guardName }).lean();
    return permissions.map((permission) => permission.name);
  }

  async setUserRoles(userId: PermissionSubjectId, roles: string[], guardName: string): Promise<void> {
    const roleDocuments = await this.findRoles(roles, guardName);
    const subjectId = String(userId);
    await this.userRoles.deleteMany({ subjectId, guardName });
    if (roleDocuments.length) {
      await this.userRoles.insertMany(roleDocuments.map((role) => ({ subjectId, roleId: role._id, guardName })));
    }
  }

  async getUserRoles(userId: PermissionSubjectId, guardName: string): Promise<string[]> {
    const relations = await this.userRoles.find({ subjectId: String(userId), guardName }).lean();
    const roles = await this.roles.find({ _id: { $in: relations.map((relation) => relation.roleId) }, guardName }).lean();
    return roles.map((role) => role.name);
  }

  async setUserPermissions(userId: PermissionSubjectId, permissions: Permission[], guardName: string): Promise<void> {
    const permissionDocuments = await this.findPermissions(permissions, guardName);
    const subjectId = String(userId);
    await this.userPermissions.deleteMany({ subjectId, guardName });
    if (permissionDocuments.length) {
      await this.userPermissions.insertMany(permissionDocuments.map((permission) => ({
        subjectId,
        permissionId: permission._id,
        guardName,
      })));
    }
  }

  async getUserPermissions(userId: PermissionSubjectId, guardName: string): Promise<Permission[]> {
    const relations = await this.userPermissions.find({ subjectId: String(userId), guardName }).lean();
    const permissions = await this.permissions.find({ _id: { $in: relations.map((relation) => relation.permissionId) }, guardName }).lean();
    return permissions.map((permission) => permission.name);
  }

  private async findRole(name: string, guardName: string): Promise<NamedDocument> {
    const role = await this.roles.findOne({ name, guardName }).lean();
    if (!role) throw new Error(`Role '${name}' was not found.`);
    return role;
  }

  private async findRoles(names: string[], guardName: string): Promise<NamedDocument[]> {
    if (!names.length) return [];
    return this.roles.find({ name: { $in: names }, guardName }).lean();
  }

  private async findPermissions(names: string[], guardName: string): Promise<NamedDocument[]> {
    if (!names.length) return [];
    return this.permissions.find({ name: { $in: names }, guardName }).lean();
  }
}
