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

describe('MongoosePermissionRepository integration', () => {
  let replicaSet: MongoMemoryReplSet;
  let connection: Connection;
  let permissions: Model<NamedDocument>;
  let roles: Model<NamedDocument>;
  let rolePermissions: Model<RolePermissionDocument>;
  let userRoles: Model<UserRoleDocument>;
  let userPermissions: Model<UserPermissionDocument>;
  let repository: MongoosePermissionRepository;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    connection = await createConnection(replicaSet.getUri()).asPromise();
    permissions = connection.model<NamedDocument>(PERMISSION_MODEL, PermissionSchema);
    roles = connection.model<NamedDocument>(ROLE_MODEL, RoleSchema);
    rolePermissions = connection.model<RolePermissionDocument>(ROLE_PERMISSION_MODEL, RolePermissionSchema);
    userRoles = connection.model<UserRoleDocument>(USER_ROLE_MODEL, UserRoleSchema);
    userPermissions = connection.model<UserPermissionDocument>(USER_PERMISSION_MODEL, UserPermissionSchema);

    await Promise.all([
      permissions.syncIndexes(),
      roles.syncIndexes(),
      rolePermissions.syncIndexes(),
      userRoles.syncIndexes(),
      userPermissions.syncIndexes(),
    ]);

    repository = new MongoosePermissionRepository(
      permissions,
      roles,
      rolePermissions,
      userRoles,
      userPermissions,
    );
  });

  afterEach(async () => {
    await Promise.all([
      permissions.deleteMany({}),
      roles.deleteMany({}),
      rolePermissions.deleteMany({}),
      userRoles.deleteMany({}),
      userPermissions.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await connection?.close();
    await replicaSet?.stop();
  });

  it('isolates global and tenant assignments through transaction-backed writes', async () => {
    await repository.createPermission('orders.read', 'default');
    await repository.createRole('viewer', 'default');
    await repository.setRolePermissions('viewer', ['orders.read'], 'default');
    await repository.setUserRoles('user-1', ['viewer'], 'default');
    await repository.setUserPermissions('user-1', ['orders.read'], 'default', 'tenant-a');

    await expect(repository.getRolePermissions('viewer', 'default')).resolves.toEqual(['orders.read']);
    await expect(repository.getUserRoles('user-1', 'default')).resolves.toEqual(['viewer']);
    await expect(repository.getUserRoles('user-1', 'default', 'tenant-a')).resolves.toEqual([]);
    await expect(repository.getUserPermissions('user-1', 'default')).resolves.toEqual([]);
    await expect(repository.getUserPermissions('user-1', 'default', 'tenant-a')).resolves.toEqual(['orders.read']);
    await expect(repository.getUserPermissions('user-1', 'default', 'tenant-b')).resolves.toEqual([]);
  });

  it('keeps concurrent duplicate assignments idempotent', async () => {
    await repository.createPermission('orders.read', 'default');
    await repository.createRole('viewer', 'default');

    await Promise.all([
      repository.addRolePermissions('viewer', ['orders.read'], 'default'),
      repository.addRolePermissions('viewer', ['orders.read'], 'default'),
      repository.addUserRoles('user-1', ['viewer'], 'default', 'tenant-a'),
      repository.addUserRoles('user-1', ['viewer'], 'default', 'tenant-a'),
      repository.addUserPermissions('user-1', ['orders.read'], 'default', 'tenant-a'),
      repository.addUserPermissions('user-1', ['orders.read'], 'default', 'tenant-a'),
    ]);

    await expect(rolePermissions.countDocuments({})).resolves.toBe(1);
    await expect(userRoles.countDocuments({})).resolves.toBe(1);
    await expect(userPermissions.countDocuments({})).resolves.toBe(1);
  });

  it('deletes permission assignments in the same transaction as the permission', async () => {
    await repository.createPermission('orders.read', 'default');
    await repository.createRole('viewer', 'default');
    await repository.addRolePermissions('viewer', ['orders.read'], 'default');
    await repository.addUserPermissions('user-1', ['orders.read'], 'default');

    await repository.deletePermission('orders.read', 'default');

    await expect(permissions.countDocuments({})).resolves.toBe(0);
    await expect(rolePermissions.countDocuments({})).resolves.toBe(0);
    await expect(userPermissions.countDocuments({})).resolves.toBe(0);
  });

  it('deletes role assignments in the same transaction as the role', async () => {
    await repository.createPermission('orders.read', 'default');
    await repository.createRole('viewer', 'default');
    await repository.addRolePermissions('viewer', ['orders.read'], 'default');
    await repository.addUserRoles('user-1', ['viewer'], 'default');

    await repository.deleteRole('viewer', 'default');

    await expect(roles.countDocuments({})).resolves.toBe(0);
    await expect(rolePermissions.countDocuments({})).resolves.toBe(0);
    await expect(userRoles.countDocuments({})).resolves.toBe(0);
  });
});
