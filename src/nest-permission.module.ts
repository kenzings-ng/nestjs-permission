import { DynamicModule, Module, ModuleMetadata, Provider, Type } from '@nestjs/common';
import { PERMISSION_EVALUATOR, PERMISSION_OPTIONS, PERMISSION_REPOSITORY } from './constants';
import { InMemoryPermissionRepository } from './in-memory-permission.repository';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './permissions.guard';
import { RepositoryPermissionEvaluator } from './repository-permission.evaluator';
import { NestPermissionModuleOptions, PermissionEvaluator, PermissionRepository } from './types';

@Module({})
export class NestPermissionModule {
  static forRoot(options: NestPermissionModuleOptions = {}): DynamicModule {
    return this.createModule(InMemoryPermissionRepository, RepositoryPermissionEvaluator, options);
  }

  /** Uses an ORM-backed repository while retaining the built-in evaluator and guard. */
  static forRootWithRepository(
    repository: Type<PermissionRepository>,
    options: NestPermissionModuleOptions = {},
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return this.createModule(repository, RepositoryPermissionEvaluator, options, imports);
  }

  /** Replaces the default evaluator, for example with a database-backed adapter. */
  static forRootWithEvaluator(
    evaluator: Type<PermissionEvaluator>,
    options: NestPermissionModuleOptions = {},
  ): DynamicModule {
    return this.createModule(InMemoryPermissionRepository, evaluator, options);
  }

  static forRootWithRepositoryAndEvaluator(
    repository: Type<PermissionRepository>,
    evaluator: Type<PermissionEvaluator>,
    options: NestPermissionModuleOptions = {},
  ): DynamicModule {
    return this.createModule(repository, evaluator, options);
  }

  private static createModule(
    repository: Type<PermissionRepository>,
    evaluator: Type<PermissionEvaluator>,
    options: NestPermissionModuleOptions,
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    const providers: Provider[] = [
      { provide: PERMISSION_OPTIONS, useValue: options },
      repository,
      { provide: PERMISSION_REPOSITORY, useExisting: repository },
      PermissionService,
      evaluator,
      { provide: PERMISSION_EVALUATOR, useExisting: evaluator },
      PermissionsGuard,
    ];

    return {
      module: NestPermissionModule,
      imports,
      providers,
      exports: [PERMISSION_EVALUATOR, PERMISSION_REPOSITORY, PermissionService, PermissionsGuard],
    };
  }
}
