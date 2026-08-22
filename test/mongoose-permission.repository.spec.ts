import { ClientSession, Model, Types } from 'mongoose';
import { MongoosePermissionRepository } from '../src/mongoose/mongoose-permission.repository';
import {
  NamedDocument,
  RolePermissionDocument,
  UserPermissionDocument,
  UserRoleDocument,
} from '../src/mongoose/mongoose-permission.schemas';

function leanQuery<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function sessionLeanQuery<T>(value: T) {
  const query = {
    lean: jest.fn().mockResolvedValue(value),
    session: jest.fn(),
  };
  query.session.mockReturnValue(query);
  return query;
}

function sessionMutation() {
  return { session: jest.fn().mockResolvedValue(undefined) };
}

function deferredSessionMutation() {
  let resolve!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((done) => { markStarted = done; });
  const completion = new Promise<void>((done) => { resolve = done; });
  const mutation = {
    session: jest.fn().mockImplementation(() => {
      markStarted();
      return completion;
    }),
  };
  return { mutation, started, resolve };
}

function setup() {
  const session = {
    withTransaction: jest.fn(async (operation: () => Promise<unknown>) => operation()),
    endSession: jest.fn().mockResolvedValue(undefined),
  } as unknown as ClientSession;
  const permissions = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    updateMany: jest.fn().mockResolvedValue(undefined),
    updateOne: jest.fn().mockResolvedValue(undefined),
  };
  const roles = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    updateMany: jest.fn().mockResolvedValue(undefined),
    updateOne: jest.fn().mockResolvedValue(undefined),
  };
  const rolePermissions = {
    db: { startSession: jest.fn().mockResolvedValue(session) },
    find: jest.fn().mockReturnValue(leanQuery([])),
    insertMany: jest.fn(),
    bulkWrite: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn(),
  };
  const userRoles = {
    find: jest.fn().mockReturnValue(leanQuery([])),
    insertMany: jest.fn(),
    bulkWrite: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn(),
  };
  const userPermissions = {
    find: jest.fn().mockReturnValue(leanQuery([])),
    insertMany: jest.fn(),
    bulkWrite: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn(),
  };

  const repository = new MongoosePermissionRepository(
    permissions as unknown as Model<NamedDocument>,
    roles as unknown as Model<NamedDocument>,
    rolePermissions as unknown as Model<RolePermissionDocument>,
    userRoles as unknown as Model<UserRoleDocument>,
    userPermissions as unknown as Model<UserPermissionDocument>,
  );

  return { repository, session, permissions, roles, rolePermissions, userRoles, userPermissions };
}

describe('MongoosePermissionRepository mutations', () => {
  it('adds role permissions with idempotent upserts', async () => {
    const { repository, permissions, roles, rolePermissions } = setup();
    const role = { _id: new Types.ObjectId(), name: 'viewer', guardName: 'default' };
    const permission = { _id: new Types.ObjectId(), name: 'orders.read', guardName: 'default' };
    roles.findOne.mockReturnValue(sessionLeanQuery(role));
    permissions.find.mockReturnValue(sessionLeanQuery([permission]));

    await repository.addRolePermissions('viewer', ['orders.read'], 'default');

    expect(rolePermissions.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { roleId: role._id, permissionId: permission._id, guardName: 'default' },
          update: { $setOnInsert: { roleId: role._id, permissionId: permission._id, guardName: 'default' } },
          upsert: true,
        },
      },
    ], { ordered: false, session: expect.anything() });
    expect(roles.updateOne).toHaveBeenCalledWith(
      { name: 'viewer', guardName: 'default' },
      { $inc: { relationRevision: 1 } },
      { session: expect.anything() },
    );
    expect(permissions.updateMany).toHaveBeenCalledWith(
      { name: { $in: ['orders.read'] }, guardName: 'default' },
      { $inc: { relationRevision: 1 } },
      { session: expect.anything() },
    );
    expect(rolePermissions.insertMany).not.toHaveBeenCalled();
  });

  it('adds user roles with tenant-aware idempotent upserts', async () => {
    const { repository, roles, userRoles } = setup();
    const role = { _id: new Types.ObjectId(), name: 'viewer', guardName: 'default' };
    roles.find.mockReturnValue(sessionLeanQuery([role]));

    await repository.addUserRoles('user-1', ['viewer'], 'default', 'tenant-a');

    const relation = { subjectId: 'user-1', roleId: role._id, guardName: 'default', tenantId: 'tenant-a' };
    expect(userRoles.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: relation, update: { $setOnInsert: relation }, upsert: true } },
    ], { ordered: false, session: expect.anything() });
    expect(userRoles.insertMany).not.toHaveBeenCalled();
  });

  it('adds user permissions with tenant-aware idempotent upserts', async () => {
    const { repository, permissions, userPermissions } = setup();
    const permission = { _id: new Types.ObjectId(), name: 'orders.read', guardName: 'default' };
    permissions.find.mockReturnValue(sessionLeanQuery([permission]));

    await repository.addUserPermissions('user-1', ['orders.read'], 'default');

    const relation = { subjectId: 'user-1', permissionId: permission._id, guardName: 'default' };
    expect(userPermissions.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { ...relation, tenantId: null },
          update: { $setOnInsert: relation },
          upsert: true,
        },
      },
    ], { ordered: false, session: expect.anything() });
    expect(userPermissions.insertMany).not.toHaveBeenCalled();
  });

  it('deletes a permission and its relations in one transaction', async () => {
    const { repository, session, permissions, rolePermissions, userPermissions } = setup();
    const permission = { _id: new Types.ObjectId(), name: 'orders.read', guardName: 'default' };
    const permissionDelete = sessionLeanQuery(permission);
    const roleDelete = deferredSessionMutation();
    const userDelete = sessionMutation();
    permissions.findOneAndDelete.mockReturnValue(permissionDelete);
    rolePermissions.deleteMany.mockReturnValue(roleDelete.mutation);
    userPermissions.deleteMany.mockReturnValue(userDelete);

    const deletion = repository.deletePermission('orders.read', 'default');
    await roleDelete.started;

    expect(userPermissions.deleteMany).not.toHaveBeenCalled();

    roleDelete.resolve();
    await deletion;

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(permissionDelete.session).toHaveBeenCalledWith(session);
    expect(roleDelete.mutation.session).toHaveBeenCalledWith(session);
    expect(userDelete.session).toHaveBeenCalledWith(session);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('deletes a role and its relations in one transaction', async () => {
    const { repository, session, roles, rolePermissions, userRoles } = setup();
    const role = { _id: new Types.ObjectId(), name: 'viewer', guardName: 'default' };
    const roleDocumentDelete = sessionLeanQuery(role);
    const permissionDelete = deferredSessionMutation();
    const userDelete = sessionMutation();
    roles.findOneAndDelete.mockReturnValue(roleDocumentDelete);
    rolePermissions.deleteMany.mockReturnValue(permissionDelete.mutation);
    userRoles.deleteMany.mockReturnValue(userDelete);

    const deletion = repository.deleteRole('viewer', 'default');
    await permissionDelete.started;

    expect(userRoles.deleteMany).not.toHaveBeenCalled();

    permissionDelete.resolve();
    await deletion;

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(roleDocumentDelete.session).toHaveBeenCalledWith(session);
    expect(permissionDelete.mutation.session).toHaveBeenCalledWith(session);
    expect(userDelete.session).toHaveBeenCalledWith(session);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
