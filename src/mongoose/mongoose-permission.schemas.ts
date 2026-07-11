import { Schema, Types } from 'mongoose';

export const PERMISSION_MODEL = 'NestPermissionPermission';
export const ROLE_MODEL = 'NestPermissionRole';
export const ROLE_PERMISSION_MODEL = 'NestPermissionRolePermission';
export const USER_ROLE_MODEL = 'NestPermissionUserRole';
export const USER_PERMISSION_MODEL = 'NestPermissionUserPermission';

const commonNamedFields = {
  name: { type: String, required: true, trim: true },
  guardName: { type: String, required: true, default: 'default', trim: true },
  description: { type: String, trim: true },
  metadata: { type: Schema.Types.Mixed },
};

export const PermissionSchema = new Schema(commonNamedFields, { timestamps: true });
PermissionSchema.index({ name: 1, guardName: 1 }, { unique: true });

export const RoleSchema = new Schema(commonNamedFields, { timestamps: true });
RoleSchema.index({ name: 1, guardName: 1 }, { unique: true });

const rolePermissionFields = {
  roleId: { type: Schema.Types.ObjectId, ref: ROLE_MODEL, required: true },
  permissionId: { type: Schema.Types.ObjectId, ref: PERMISSION_MODEL, required: true },
  guardName: { type: String, required: true, default: 'default', trim: true },
};
export const RolePermissionSchema = new Schema(rolePermissionFields, { timestamps: true });
RolePermissionSchema.index({ roleId: 1, permissionId: 1, guardName: 1 }, { unique: true });

const subjectPermissionFields = {
  subjectId: { type: String, required: true, trim: true },
  permissionId: { type: Schema.Types.ObjectId, ref: PERMISSION_MODEL, required: true },
  guardName: { type: String, required: true, default: 'default', trim: true },
  tenantId: { type: String, trim: true },
};
export const UserPermissionSchema = new Schema(subjectPermissionFields, { timestamps: true });
UserPermissionSchema.index({ subjectId: 1, permissionId: 1, guardName: 1, tenantId: 1 }, { unique: true });

const subjectRoleFields = {
  subjectId: { type: String, required: true, trim: true },
  roleId: { type: Schema.Types.ObjectId, ref: ROLE_MODEL, required: true },
  guardName: { type: String, required: true, default: 'default', trim: true },
  tenantId: { type: String, trim: true },
};
export const UserRoleSchema = new Schema(subjectRoleFields, { timestamps: true });
UserRoleSchema.index({ subjectId: 1, roleId: 1, guardName: 1, tenantId: 1 }, { unique: true });

export interface NamedDocument {
  _id: Types.ObjectId;
  name: string;
  guardName: string;
}

export interface RolePermissionDocument {
  roleId: Types.ObjectId;
  permissionId: Types.ObjectId;
  guardName: string;
}

export interface UserRoleDocument {
  subjectId: string;
  roleId: Types.ObjectId;
  guardName: string;
}

export interface UserPermissionDocument {
  subjectId: string;
  permissionId: Types.ObjectId;
  guardName: string;
}
