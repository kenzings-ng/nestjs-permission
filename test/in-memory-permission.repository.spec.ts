import { InMemoryPermissionRepository } from '../src/in-memory-permission.repository';

describe('InMemoryPermissionRepository isolation', () => {
  let repository: InMemoryPermissionRepository;

  beforeEach(() => {
    repository = new InMemoryPermissionRepository();
  });

  it('keeps the global scope distinct from an empty tenant id', async () => {
    await repository.setUserRoles('user-1', ['global-role'], 'default', undefined);

    await expect(repository.getUserRoles('user-1', 'default', '')).resolves.toEqual([]);
  });

  it('does not allow delimiter characters to collide across tuple fields', async () => {
    await repository.createPermission('b:c', 'a');
    await repository.setUserRoles('user', ['tenant-role'], 'a:b', 'c');

    await expect(repository.permissionExists('c', 'a:b')).resolves.toBe(false);
    await expect(repository.getUserRoles('user', 'a', 'b:c')).resolves.toEqual([]);
  });

  it('does not clean up assignments belonging to a guard with the same prefix', async () => {
    await repository.createPermission('orders.read', 'admin');
    await repository.setRolePermissions('viewer', ['orders.read'], 'admin:internal');

    await repository.deletePermission('orders.read', 'admin');

    await expect(repository.getRolePermissions('viewer', 'admin:internal')).resolves.toEqual(['orders.read']);
  });

  it('returns defensive copies of stored assignments', async () => {
    await repository.setUserPermissions('user-1', ['orders.read'], 'default');
    const returned = await repository.getUserPermissions('user-1', 'default');

    returned.push('orders.refund');

    await expect(repository.getUserPermissions('user-1', 'default')).resolves.toEqual(['orders.read']);
  });

  it('treats numeric and string forms of the same subject id as one subject', async () => {
    await repository.setUserRoles(1, ['viewer'], 'default');

    await expect(repository.getUserRoles('1', 'default')).resolves.toEqual(['viewer']);
  });
});
