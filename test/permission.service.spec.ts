import { InMemoryPermissionRepository } from '../src/in-memory-permission.repository';
import { PermissionService } from '../src/permission.service';
import { PermissionRepository, PermissionSubjectId } from '../src/types';

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(() => {
    service = new PermissionService(new InMemoryPermissionRepository(), {});
  });

  it('inherits permissions from assigned roles', async () => {
    await service.createPermission('products.create');
    await service.createPermission('products.delete');
    await service.createRole('merchant');
    await service.givePermissionToRole('merchant', 'products.create', 'products.delete');
    await service.assignRole('user-1', 'merchant');

    await expect(service.hasPermissionTo('user-1', 'products.create')).resolves.toBe(true);
    await expect(service.hasPermissionTo('user-1', 'products.update')).resolves.toBe(false);
  });

  it('supports direct permissions, wildcard permissions, and sync', async () => {
    await service.createPermission('orders.*');
    await service.createPermission('products.create');
    await service.givePermissionTo('user-1', 'orders.*', 'products.create');
    await service.syncDirectPermissions('user-1', ['orders.*']);

    await expect(service.hasPermissionTo('user-1', 'orders.refund')).resolves.toBe(true);
    await expect(service.hasPermissionTo('user-1', 'products.create')).resolves.toBe(false);
  });

  it('uses atomic add/remove repository hooks when available', async () => {
    const repository: PermissionRepository = {
      createPermission: jest.fn(),
      deletePermission: jest.fn(),
      createRole: jest.fn(),
      deleteRole: jest.fn(),
      permissionExists: jest.fn().mockResolvedValue(true),
      roleExists: jest.fn().mockResolvedValue(true),
      setRolePermissions: jest.fn(),
      getRolePermissions: jest.fn().mockResolvedValue([]),
      setUserRoles: jest.fn(),
      getUserRoles: jest.fn().mockResolvedValue([]),
      setUserPermissions: jest.fn(),
      getUserPermissions: jest.fn().mockResolvedValue([]),
      addRolePermissions: jest.fn(),
      removeRolePermissions: jest.fn(),
      addUserRoles: jest.fn(),
      removeUserRoles: jest.fn(),
      addUserPermissions: jest.fn(),
      removeUserPermissions: jest.fn(),
    };

    const atomicService = new PermissionService(repository, {});

    await atomicService.givePermissionToRole('merchant', 'products.create');
    await atomicService.revokePermissionFromRole('merchant', 'products.create');
    await atomicService.assignRole('user-1', 'merchant');
    await atomicService.removeRole('user-1', 'merchant');
    await atomicService.givePermissionTo('user-1', 'products.create');
    await atomicService.revokePermissionTo('user-1', 'products.create');

    expect(repository.addRolePermissions).toHaveBeenCalledWith('merchant', ['products.create'], 'default');
    expect(repository.removeRolePermissions).toHaveBeenCalledWith('merchant', 'products.create', 'default');
    expect(repository.addUserRoles).toHaveBeenCalledWith('user-1', ['merchant'], 'default');
    expect(repository.removeUserRoles).toHaveBeenCalledWith('user-1', 'merchant', 'default');
    expect(repository.addUserPermissions).toHaveBeenCalledWith('user-1', ['products.create'], 'default');
    expect(repository.removeUserPermissions).toHaveBeenCalledWith('user-1', 'products.create', 'default');
  });
});
