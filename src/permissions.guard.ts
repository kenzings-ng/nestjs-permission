import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_EVALUATOR, PERMISSION_OPTIONS, REQUIRED_PERMISSIONS_KEY } from './constants';
import { assertNonEmptyPermissions } from './permission-metadata';
import { NestPermissionModuleOptions, PermissionEvaluator, PermissionUser, RequiredPermissions } from './types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PERMISSION_EVALUATOR) private readonly evaluator: PermissionEvaluator,
    @Inject(PERMISSION_OPTIONS) private readonly options: NestPermissionModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermissions>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    assertNonEmptyPermissions(required.permissions);

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const user = request[this.options.userProperty ?? 'user'] as PermissionUser | undefined;
    return this.evaluator.hasPermissions(user, required);
  }
}
