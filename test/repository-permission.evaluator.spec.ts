import { InMemoryPermissionRepository } from '../src/in-memory-permission.repository';
import { PermissionService } from '../src/permission.service';
import { RepositoryPermissionEvaluator } from '../src/repository-permission.evaluator';
import { NestPermissionModuleOptions } from '../src/types';

describe('RepositoryPermissionEvaluator', () => {
  const options: NestPermissionModuleOptions = {};

  async function setup() {
    const repository = new InMemoryPermissionRepository();
    const service = new PermissionService(repository, options);
    const evaluator = new RepositoryPermissionEvaluator(service, options);

    await service.createPermission('orders.read');
    await service.createRole('viewer');
    await service.givePermissionToRole('viewer', 'orders.read');

    return { service, evaluator };
  }

  it('denies when no user is present', async () => {
    const { evaluator } = await setup();
    await expect(
      evaluator.hasPermissions(undefined, { permissions: ['orders.read'], mode: 'all' }),
    ).resolves.toBe(false);
  });

  it('resolves permissions for the global (tenant-less) scope when tenantId is absent', async () => {
    const { service, evaluator } = await setup();
    await service.assignRole('user-1', 'viewer');

    await expect(
      evaluator.hasPermissions({ id: 'user-1' }, { permissions: ['orders.read'], mode: 'all' }),
    ).resolves.toBe(true);
  });

  it('routes through PermissionService.forTenant when user.tenantId is set', async () => {
    const { service, evaluator } = await setup();
    await service.forTenant('tenant-a').assignRole('user-1', 'viewer');

    // Global scope: user-1 has no assignment, so access is denied.
    await expect(
      evaluator.hasPermissions({ id: 'user-1' }, { permissions: ['orders.read'], mode: 'all' }),
    ).resolves.toBe(false);

    // tenant-a scope: user-1 was assigned the 'viewer' role there, so access is granted.
    await expect(
      evaluator.hasPermissions(
        { id: 'user-1', tenantId: 'tenant-a' },
        { permissions: ['orders.read'], mode: 'all' },
      ),
    ).resolves.toBe(true);

    // A different tenant must not see tenant-a's assignment.
    await expect(
      evaluator.hasPermissions(
        { id: 'user-1', tenantId: 'tenant-b' },
        { permissions: ['orders.read'], mode: 'all' },
      ),
    ).resolves.toBe(false);
  });

  it('falls back to user.permissions when user.id is not provided, ignoring tenantId', async () => {
    const { evaluator } = await setup();
    await expect(
      evaluator.hasPermissions(
        { permissions: ['orders.read'], tenantId: 'tenant-a' },
        { permissions: ['orders.read'], mode: 'all' },
      ),
    ).resolves.toBe(true);
  });

  it('honors wildcard permissions when resolving via a tenant-scoped service', async () => {
    const { service, evaluator } = await setup();
    await service.createPermission('orders.*');
    await service.forTenant('tenant-a').givePermissionTo('user-2', 'orders.*');

    await expect(
      evaluator.hasPermissions(
        { id: 'user-2', tenantId: 'tenant-a' },
        { permissions: ['orders.read', 'orders.refund'], mode: 'all' },
      ),
    ).resolves.toBe(true);
  });
});
