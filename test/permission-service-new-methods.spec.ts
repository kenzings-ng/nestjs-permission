import { InMemoryPermissionRepository } from '../src/in-memory-permission.repository';
import { PermissionService } from '../src/permission.service';

describe('PermissionService — new methods', () => {
  let repository: InMemoryPermissionRepository;
  let service: PermissionService;

  beforeEach(async () => {
    repository = new InMemoryPermissionRepository();
    service = new PermissionService(repository, {});

    await service.createPermission('orders.read');
    await service.createPermission('orders.refund');
    await service.createPermission('products.create');
    await service.createRole('viewer');
    await service.createRole('merchant');
  });

  describe('listPermissions()', () => {
    it('returns all defined permissions for the guard', async () => {
      const result = await service.listPermissions()!;
      expect(result.sort()).toEqual(['orders.read', 'orders.refund', 'products.create'].sort());
    });

    it('is scoped to the guard — different guard sees nothing', async () => {
      const otherService = new PermissionService(repository, { guardName: 'admin' });
      const result = await otherService.listPermissions()!;
      expect(result).toEqual([]);
    });

    it('reflects deletions', async () => {
      await service.deletePermission('products.create');
      const result = await service.listPermissions()!;
      expect(result).not.toContain('products.create');
    });
  });

  describe('listRoles()', () => {
    it('returns all defined roles for the guard', async () => {
      const result = await service.listRoles()!;
      expect(result.sort()).toEqual(['merchant', 'viewer'].sort());
    });

    it('is scoped to the guard — different guard sees nothing', async () => {
      const otherService = new PermissionService(repository, { guardName: 'admin' });
      const result = await otherService.listRoles()!;
      expect(result).toEqual([]);
    });

    it('reflects deletions', async () => {
      await service.deleteRole('merchant');
      const result = await service.listRoles()!;
      expect(result).not.toContain('merchant');
    });
  });

  describe('getDirectPermissions()', () => {
    it('returns only direct user permissions (not inherited from roles)', async () => {
      await service.givePermissionToRole('viewer', 'orders.read');
      await service.assignRole('user-1', 'viewer');
      await service.givePermissionTo('user-1', 'orders.refund');

      const direct = await service.getDirectPermissions('user-1');
      expect(direct).toEqual(['orders.refund']);
      expect(direct).not.toContain('orders.read');
    });

    it('returns empty array when user has no direct permissions', async () => {
      await service.assignRole('user-1', 'viewer');
      const direct = await service.getDirectPermissions('user-1');
      expect(direct).toEqual([]);
    });

    it('is distinct from getAllPermissions which includes role-inherited ones', async () => {
      await service.givePermissionToRole('viewer', 'orders.read');
      await service.assignRole('user-1', 'viewer');
      await service.givePermissionTo('user-1', 'orders.refund');

      const direct = await service.getDirectPermissions('user-1');
      const all = await service.getAllPermissions('user-1');

      expect(direct).toHaveLength(1);
      expect(all).toHaveLength(2);
      expect(all.sort()).toEqual(['orders.read', 'orders.refund'].sort());
    });

    it('is tenant-scoped when called on a scoped service', async () => {
      const tenantA = service.forTenant('tenant-a');
      await tenantA.givePermissionTo('user-1', 'orders.refund');

      const directGlobal = await service.getDirectPermissions('user-1');
      const directTenantA = await tenantA.getDirectPermissions('user-1');

      expect(directGlobal).toEqual([]);
      expect(directTenantA).toEqual(['orders.refund']);
    });
  });
});
