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
    expect(repository.addUserRoles).toHaveBeenCalledWith('user-1', ['merchant'], 'default', undefined);
    expect(repository.removeUserRoles).toHaveBeenCalledWith('user-1', 'merchant', 'default', undefined);
    expect(repository.addUserPermissions).toHaveBeenCalledWith('user-1', ['products.create'], 'default', undefined);
    expect(repository.removeUserPermissions).toHaveBeenCalledWith('user-1', 'products.create', 'default', undefined);
  });

  it('keeps assignments belonging to other guards when deleting a permission or role', async () => {
    const repository = new InMemoryPermissionRepository();
    const adminService = new PermissionService(repository, { guardName: 'admin' });
    const customerService = new PermissionService(repository, { guardName: 'customer' });

    for (const service of [adminService, customerService]) {
      await service.createPermission('orders.read');
      await service.createRole('viewer');
      await service.givePermissionToRole('viewer', 'orders.read');
      await service.assignRole('user-1', 'viewer');
      await service.givePermissionTo('user-1', 'orders.read');
    }

    await adminService.deletePermission('orders.read');
    await adminService.deleteRole('viewer');

    await expect(customerService.getAllPermissions('user-1')).resolves.toEqual(['orders.read']);
    await expect(customerService.getRoles('user-1')).resolves.toEqual(['viewer']);
  });

  it('checks roles and batches of permissions in one call', async () => {
    await service.createPermission('products.create');
    await service.createPermission('products.delete');
    await service.createRole('merchant');
    await service.givePermissionToRole('merchant', 'products.create');
    await service.assignRole('user-1', 'merchant');
    await service.givePermissionTo('user-1', 'products.delete');

    await expect(service.hasRole('user-1', 'merchant')).resolves.toBe(true);
    await expect(service.hasRole('user-1', 'admin')).resolves.toBe(false);
    await expect(service.hasAnyRole('user-1', 'admin', 'merchant')).resolves.toBe(true);
    await expect(service.hasAllRoles('user-1', 'admin', 'merchant')).resolves.toBe(false);

    await expect(service.hasAllPermissions('user-1', 'products.create', 'products.delete')).resolves.toBe(true);
    await expect(service.hasAllPermissions('user-1', 'products.create', 'products.publish')).resolves.toBe(false);
    await expect(service.hasAnyPermission('user-1', 'products.publish', 'products.delete')).resolves.toBe(true);
    await expect(service.hasAnyPermission('user-1', 'products.publish', 'products.archive')).resolves.toBe(false);
  });

  it('isolates user assignments per tenant while sharing definitions', async () => {
    await service.createPermission('orders.read');
    await service.createPermission('orders.refund');
    await service.createRole('viewer');
    await service.givePermissionToRole('viewer', 'orders.read');

    const tenantA = service.forTenant('tenant-a');
    const tenantB = service.forTenant('tenant-b');

    await tenantA.assignRole('user-1', 'viewer');
    await tenantA.givePermissionTo('user-1', 'orders.refund');

    await expect(tenantA.hasPermissionTo('user-1', 'orders.read')).resolves.toBe(true);
    await expect(tenantA.hasPermissionTo('user-1', 'orders.refund')).resolves.toBe(true);
    await expect(tenantA.hasRole('user-1', 'viewer')).resolves.toBe(true);

    await expect(tenantB.hasPermissionTo('user-1', 'orders.read')).resolves.toBe(false);
    await expect(tenantB.hasRole('user-1', 'viewer')).resolves.toBe(false);
    await expect(service.hasPermissionTo('user-1', 'orders.read')).resolves.toBe(false);

    await tenantA.removeRole('user-1', 'viewer');
    await expect(tenantA.hasPermissionTo('user-1', 'orders.read')).resolves.toBe(false);
    await expect(tenantA.hasPermissionTo('user-1', 'orders.refund')).resolves.toBe(true);
  });
});
