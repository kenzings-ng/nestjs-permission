import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS_KEY } from './constants';
import { assertNonEmptyPermissions } from './permission-metadata';
import { NonEmptyPermissions, RequiredPermissions } from './types';

/** Declares permissions that the authenticated user must have to invoke a route. */
export function RequirePermissions(...permissions: NonEmptyPermissions): MethodDecorator & ClassDecorator {
  assertNonEmptyPermissions(permissions, 'RequirePermissions');
  const metadata: RequiredPermissions = { permissions, mode: 'all' };
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, metadata);
}

/** Allows access when the user holds at least one of the given permissions. */
export function RequireAnyPermission(...permissions: NonEmptyPermissions): MethodDecorator & ClassDecorator {
  assertNonEmptyPermissions(permissions, 'RequireAnyPermission');
  const metadata: RequiredPermissions = { permissions, mode: 'any' };
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, metadata);
}
