import { InMemoryPermissionRepository } from '../src/in-memory-permission.repository';
import { PermissionService } from '../src/permission.service';

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
});
