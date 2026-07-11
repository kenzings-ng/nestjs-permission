import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS_KEY } from './constants';
import { Permission, RequiredPermissions } from './types';

/** Declares permissions that the authenticated user must have to invoke a route. */
export function RequirePermissions(...permissions: Permission[]): MethodDecorator & ClassDecorator {
  const metadata: RequiredPermissions = { permissions, mode: 'all' };
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, metadata);
}

/** Allows access when the user holds at least one of the given permissions. */
export function RequireAnyPermission(...permissions: Permission[]): MethodDecorator & ClassDecorator {
  const metadata: RequiredPermissions = { permissions, mode: 'any' };
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, metadata);
}
