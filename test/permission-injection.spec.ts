import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DefaultPermissionEvaluator } from '../src/default-permission.evaluator';
import { InMemoryPermissionRepository } from '../src/in-memory-permission.repository';
import { toPermissionSet } from '../src/permission-input';
import { matchesPermission } from '../src/permission-matcher';
import { PermissionService } from '../src/permission.service';
import { PermissionsGuard } from '../src/permissions.guard';
import { RepositoryPermissionEvaluator } from '../src/repository-permission.evaluator';
import { PermissionUser, RequiredPermissions } from '../src/types';

/** Values MongoDB/Mongoose interpret as query operators rather than literals. */
const operatorObjects: unknown[] = [{ $ne: null }, { $regex: '.*' }, { $gt: '' }, { $exists: true }];

const required: RequiredPermissions = { permissions: ['products.create'], mode: 'all' };

describe('matchesPermission input hardening', () => {
  it.each([...operatorObjects, 42, true, null, undefined, ['products.*'], Symbol('x')])(
    'never matches when the granted value is not a string (%p)',
    (granted) => {
      expect(matchesPermission(granted as string, 'products.create')).toBe(false);
    },
  );

  it('never matches when the requested value is not a string', () => {
    expect(matchesPermission('*', { $ne: null } as unknown as string)).toBe(false);
    expect(matchesPermission('products.*', 42 as unknown as string)).toBe(false);
  });

  it('does not throw on a non-string operand', () => {
    expect(() => matchesPermission({ $ne: null } as unknown as string, 'products.create')).not.toThrow();
  });
});

describe('toPermissionSet', () => {
  it('drops non-string entries', () => {
    expect([...toPermissionSet(['products.read', { $ne: null }, 7, null, 'orders.read'])]).toEqual([
      'products.read',
      'orders.read',
    ]);
  });

  it('refuses to iterate a bare string into single characters', () => {
    expect([...toPermissionSet('*')]).toEqual([]);
    expect([...toPermissionSet('admin')]).toEqual([]);
  });

  it('returns an empty set for non-iterable values', () => {
    expect([...toPermissionSet({ products: true })]).toEqual([]);
    expect([...toPermissionSet(undefined)]).toEqual([]);
  });
});

describe('DefaultPermissionEvaluator input hardening', () => {
  const evaluator = new DefaultPermissionEvaluator();

  it.each(operatorObjects)('denies when user.permissions holds an operator object (%p)', (value) => {
    expect(evaluator.hasPermissions({ permissions: [value] } as unknown as PermissionUser, required)).toBe(false);
  });

  it('denies rather than throwing when user.permissions is not iterable', () => {
    const user = { permissions: { 'products.create': true } } as unknown as PermissionUser;
    expect(() => evaluator.hasPermissions(user, required)).not.toThrow();
    expect(evaluator.hasPermissions(user, required)).toBe(false);
  });

  it('denies when user.permissions is the bare string "*"', () => {
    expect(evaluator.hasPermissions({ permissions: '*' } as unknown as PermissionUser, required)).toBe(false);
  });

  it('still honours a legitimate grant alongside junk entries', () => {
    const user = { permissions: [{ $ne: null }, 'products.create'] } as unknown as PermissionUser;
    expect(evaluator.hasPermissions(user, required)).toBe(true);
  });
});

describe('RepositoryPermissionEvaluator tenant hardening', () => {
  function evaluatorWith(getAllPermissions: jest.Mock) {
    const service = { getAllPermissions, forTenant: jest.fn() } as unknown as PermissionService;
    (service.forTenant as jest.Mock).mockReturnValue(service);
    return { service, evaluator: new RepositoryPermissionEvaluator(service, {}) };
  }

  it.each(operatorObjects)('denies without querying when user.tenantId is an operator object (%p)', async (tenantId) => {
    const getAllPermissions = jest.fn().mockResolvedValue(['*']);
    const { service, evaluator } = evaluatorWith(getAllPermissions);

    await expect(
      evaluator.hasPermissions({ id: 'u1', tenantId } as unknown as PermissionUser, required),
    ).resolves.toBe(false);
    expect(service.forTenant).not.toHaveBeenCalled();
    expect(getAllPermissions).not.toHaveBeenCalled();
  });

  it('denies without querying when user.id is an operator object', async () => {
    const getAllPermissions = jest.fn().mockResolvedValue(['*']);
    const { evaluator } = evaluatorWith(getAllPermissions);

    await expect(
      evaluator.hasPermissions({ id: { $ne: null } } as unknown as PermissionUser, required),
    ).resolves.toBe(false);
    expect(getAllPermissions).not.toHaveBeenCalled();
  });

  it('still scopes normally for a legitimate string tenantId', async () => {
    const getAllPermissions = jest.fn().mockResolvedValue(['products.create']);
    const { service, evaluator } = evaluatorWith(getAllPermissions);

    await expect(evaluator.hasPermissions({ id: 'u1', tenantId: 'tenant-a' }, required)).resolves.toBe(true);
    expect(service.forTenant).toHaveBeenCalledWith('tenant-a');
  });
});

describe('PermissionService input validation', () => {
  function service(): PermissionService {
    return new PermissionService(new InMemoryPermissionRepository(), {});
  }

  it.each(operatorObjects)('rejects an operator object as a permission name (%p)', async (name) => {
    await expect(service().createPermission(name as unknown as string)).rejects.toThrow('must be a string');
  });

  it.each(operatorObjects)('rejects an operator object as a role name (%p)', async (name) => {
    await expect(service().createRole(name as unknown as string)).rejects.toThrow('must be a string');
  });

  it.each(operatorObjects)('rejects an operator object as a tenant scope (%p)', (tenantId) => {
    expect(() => service().forTenant(tenantId as unknown as string)).toThrow('tenantId must be a string');
  });

  it('rejects an operator object as a subject id', async () => {
    await expect(service().getAllPermissions({ $ne: null } as unknown as string)).rejects.toThrow(
      'userId must be a string or a finite number',
    );
  });

  it('rejects NaN and Infinity as subject ids', async () => {
    await expect(service().getRoles(NaN)).rejects.toThrow('userId must be');
    await expect(service().getRoles(Infinity)).rejects.toThrow('userId must be');
  });

  it('rejects a non-string inside a permission array', async () => {
    const target = service();
    await target.createRole('editor');
    await expect(
      target.syncPermissions('editor', ['products.read', { $ne: null }] as unknown as string[]),
    ).rejects.toThrow('permission must be a string');
  });

  it('keeps working for valid input', async () => {
    const target = service();
    await target.createPermission('products.create');
    await target.createRole('editor');
    await target.givePermissionToRole('editor', 'products.create');
    await target.assignRole(7, 'editor');

    await expect(target.hasPermissionTo(7, 'products.create')).resolves.toBe(true);
  });

  it('keeps tenant scopes isolated', async () => {
    const target = service();
    await target.createPermission('products.create');
    await target.forTenant('tenant-a').givePermissionTo('u1', 'products.create');

    await expect(target.forTenant('tenant-a').hasPermissionTo('u1', 'products.create')).resolves.toBe(true);
    await expect(target.forTenant('tenant-b').hasPermissionTo('u1', 'products.create')).resolves.toBe(false);
    await expect(target.hasPermissionTo('u1', 'products.create')).resolves.toBe(false);
  });
});

describe('PermissionsGuard non-HTTP context', () => {
  it('denies instead of throwing when the context has no HTTP request', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    const evaluator = { hasPermissions: jest.fn().mockReturnValue(true) };
    const guard = new PermissionsGuard(reflector, evaluator, {});
    const context = {
      getHandler: () => class Handler {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => undefined }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(evaluator.hasPermissions).not.toHaveBeenCalled();
  });
});
