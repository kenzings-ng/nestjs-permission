import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DefaultPermissionEvaluator } from '../src/default-permission.evaluator';
import { PermissionsGuard } from '../src/permissions.guard';
import { RequiredPermissions } from '../src/types';

describe('PermissionsGuard', () => {
  const required: RequiredPermissions = {
    permissions: ['products.create', 'products.publish'],
    mode: 'all',
  };

  function contextFor(user: unknown): ExecutionContext {
    return {
      getHandler: () => class Handler {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('allows a user with every required permission', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new DefaultPermissionEvaluator(), {});

    await expect(guard.canActivate(contextFor({ permissions: ['products.create', 'products.publish'] }))).resolves.toBe(true);
  });

  it('denies a user missing a required permission', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector, new DefaultPermissionEvaluator(), {});

    await expect(guard.canActivate(contextFor({ permissions: ['products.create'] }))).resolves.toBe(false);
  });
});
