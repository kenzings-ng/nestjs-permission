import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DefaultPermissionEvaluator } from '../src/default-permission.evaluator';
import { RequireAnyPermission, RequirePermissions } from '../src/permissions.decorator';
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

  it.each([
    ['RequirePermissions', RequirePermissions],
    ['RequireAnyPermission', RequireAnyPermission],
  ])('rejects an empty %s declaration at runtime', (_name, decorator) => {
    const invokeWithoutPermissions = decorator as unknown as () => MethodDecorator & ClassDecorator;

    expect(() => invokeWithoutPermissions()).toThrow('at least one permission');
  });

  it('rejects empty reflected permission metadata instead of allowing access', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({ permissions: [], mode: 'any' }),
    } as unknown as Reflector;
    const evaluator = { hasPermissions: jest.fn().mockReturnValue(false) };
    const guard = new PermissionsGuard(reflector, evaluator, {});

    await expect(guard.canActivate(contextFor({ permissions: [] }))).rejects.toThrow('at least one permission');
    expect(evaluator.hasPermissions).not.toHaveBeenCalled();
  });

  it('continues to allow routes without permission metadata', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const evaluator = { hasPermissions: jest.fn().mockReturnValue(false) };
    const guard = new PermissionsGuard(reflector, evaluator, {});

    await expect(guard.canActivate(contextFor(undefined))).resolves.toBe(true);
    expect(evaluator.hasPermissions).not.toHaveBeenCalled();
  });
});
