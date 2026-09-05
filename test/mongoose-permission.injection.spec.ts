import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, Model, createConnection } from 'mongoose';
import { MongoosePermissionRepository } from '../src/mongoose/mongoose-permission.repository';
import {
  NamedDocument,
  PERMISSION_MODEL,
  PermissionSchema,
  ROLE_MODEL,
  ROLE_PERMISSION_MODEL,
  RolePermissionDocument,
  RolePermissionSchema,
  RoleSchema,
  USER_PERMISSION_MODEL,
  USER_ROLE_MODEL,
  UserPermissionDocument,
  UserPermissionSchema,
  UserRoleDocument,
  UserRoleSchema,
} from '../src/mongoose/mongoose-permission.schemas';

jest.setTimeout(180_000);

/** Values MongoDB reads as query operators; unfiltered, they widen a filter instead of narrowing it. */
const operatorObjects: unknown[] = [{ $ne: null }, { $regex: '.*' }, { $exists: true }];

describe('MongoosePermissionRepository NoSQL operator injection', () => {
  let replicaSet: MongoMemoryReplSet;
  let connection: Connection;
  let repository: MongoosePermissionRepository;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = createConnection(replicaSet.getUri());
    await connection.asPromise();

    const permissions = connection.model<NamedDocument>(PERMISSION_MODEL, PermissionSchema);
    const roles = connection.model<NamedDocument>(ROLE_MODEL, RoleSchema);
    const rolePermissions = connection.model<RolePermissionDocument>(ROLE_PERMISSION_MODEL, RolePermissionSchema);
    const userRoles = connection.model<UserRoleDocument>(USER_ROLE_MODEL, UserRoleSchema);
    const userPermissions = connection.model<UserPermissionDocument>(USER_PERMISSION_MODEL, UserPermissionSchema);

    repository = new MongoosePermissionRepository(
      permissions as Model<NamedDocument>,
      roles as Model<NamedDocument>,
      rolePermissions as Model<RolePermissionDocument>,
      userRoles as Model<UserRoleDocument>,
      userPermissions as Model<UserPermissionDocument>,
    );

    await repository.createPermission('products.read', 'default');
    await repository.createPermission('products.write', 'default');
    await repository.setUserPermissions('u1', ['products.read'], 'default', 'tenant-a');
    await repository.setUserPermissions('u1', ['products.write'], 'default', 'tenant-b');
    await repository.setUserPermissions('u1', [], 'default');
  });

  afterAll(async () => {
    await connection?.close();
    await replicaSet?.stop();
  });

  it.each(operatorObjects)('permissionExists rejects an operator object instead of matching any document (%p)', async (name) => {
    await expect(repository.permissionExists(name as unknown as string, 'default')).rejects.toThrow(
      'permission must be a string',
    );
  });

  it.each(operatorObjects)('roleExists rejects an operator object (%p)', async (name) => {
    await expect(repository.roleExists(name as unknown as string, 'default')).rejects.toThrow('role must be a string');
  });

  it.each(operatorObjects)('getUserPermissions rejects an operator object in tenantId (%p)', async (tenantId) => {
    await expect(
      repository.getUserPermissions('u1', 'default', tenantId as unknown as string),
    ).rejects.toThrow('tenantId must be a string');
  });

  it.each(operatorObjects)('getUserRoles rejects an operator object in tenantId (%p)', async (tenantId) => {
    await expect(repository.getUserRoles('u1', 'default', tenantId as unknown as string)).rejects.toThrow(
      'tenantId must be a string',
    );
  });

  it('rejects an operator object as a subject id', async () => {
    await expect(
      repository.getUserPermissions({ $ne: null } as unknown as string, 'default', 'tenant-a'),
    ).rejects.toThrow('userId must be a string or a finite number');
  });

  it('rejects an operator object as a guard name', async () => {
    await expect(
      repository.listPermissions({ $ne: null } as unknown as string),
    ).rejects.toThrow('guardName must be a string');
  });

  it('keeps each tenant scope readable in isolation', async () => {
    await expect(repository.getUserPermissions('u1', 'default', 'tenant-a')).resolves.toEqual(['products.read']);
    await expect(repository.getUserPermissions('u1', 'default', 'tenant-b')).resolves.toEqual(['products.write']);
    await expect(repository.getUserPermissions('u1', 'default')).resolves.toEqual([]);
  });
});
