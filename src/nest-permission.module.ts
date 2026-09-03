import { DynamicModule, Global, Module, ModuleMetadata, Provider, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_EVALUATOR, PERMISSION_OPTIONS, PERMISSION_REPOSITORY } from './constants';
import { InMemoryPermissionRepository } from './in-memory-permission.repository';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './permissions.guard';
import { RepositoryPermissionEvaluator } from './repository-permission.evaluator';
import {
  NestPermissionModuleAsyncOptions,
  NestPermissionModuleOptions,
  NestPermissionModuleOptionsFactory,
  PermissionEvaluator,
  PermissionRepository,
} from './types';

@Global()
@Module({})
export class NestPermissionModule {
  /** Registers the module with synchronous static options. */
  static forRoot(options: NestPermissionModuleOptions = {}): DynamicModule {
    return this.createModule(InMemoryPermissionRepository, RepositoryPermissionEvaluator, options);
  }

  /**
   * Registers the module with asynchronous options — supports useFactory, useClass, useExisting.
   * Uses the built-in in-memory repository and default evaluator.
   *
   * @example
   * NestPermissionModule.forRootAsync({
   *   imports: [ConfigModule],
   *   useFactory: (config: ConfigService) => ({
   *     guardName: config.get('PERMISSION_GUARD'),
   *   }),
   *   inject: [ConfigService],
   * })
   */
  static forRootAsync(options: NestPermissionModuleAsyncOptions): DynamicModule {
    return this.createAsyncModule(
      InMemoryPermissionRepository,
      RepositoryPermissionEvaluator,
      options,
    );
  }

  /** Uses an ORM-backed repository while retaining the built-in evaluator and guard. */
  static forRootWithRepository(
    repository: Type<PermissionRepository>,
    options: NestPermissionModuleOptions = {},
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return this.createModule(repository, RepositoryPermissionEvaluator, options, imports);
  }

  /**
   * Uses an ORM-backed repository with async options.
   *
   * @example
   * NestPermissionModule.forRootAsyncWithRepository(MyRepository, {
   *   imports: [ConfigModule],
   *   useFactory: (config: ConfigService) => ({ guardName: config.get('GUARD') }),
   *   inject: [ConfigService],
   * }, [MyDatabaseModule])
   */
  static forRootAsyncWithRepository(
    repository: Type<PermissionRepository>,
    options: NestPermissionModuleAsyncOptions,
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return this.createAsyncModule(repository, RepositoryPermissionEvaluator, options, imports);
  }

  /** Replaces the default evaluator, for example with a database-backed adapter. */
  static forRootWithEvaluator(
    evaluator: Type<PermissionEvaluator>,
    options: NestPermissionModuleOptions = {},
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return this.createModule(InMemoryPermissionRepository, evaluator, options, imports);
  }

  static forRootWithRepositoryAndEvaluator(
    repository: Type<PermissionRepository>,
    evaluator: Type<PermissionEvaluator>,
    options: NestPermissionModuleOptions = {},
    imports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    return this.createModule(repository, evaluator, options, imports);
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
      Reflector,
    ];

    return {
      module: NestPermissionModule,
      global: true,
      imports,
      providers,
      exports: [
        PERMISSION_OPTIONS,
        PERMISSION_EVALUATOR,
        PERMISSION_REPOSITORY,
        PermissionService,
        PermissionsGuard,
        Reflector,
      ],
    };
  }

  private static createAsyncModule(
    repository: Type<PermissionRepository>,
    evaluator: Type<PermissionEvaluator>,
    asyncOptions: NestPermissionModuleAsyncOptions,
    extraImports: ModuleMetadata['imports'] = [],
  ): DynamicModule {
    const providers: Provider[] = [
      ...this.createAsyncOptionsProviders(asyncOptions),
      repository,
      { provide: PERMISSION_REPOSITORY, useExisting: repository },
      PermissionService,
      evaluator,
      { provide: PERMISSION_EVALUATOR, useExisting: evaluator },
      PermissionsGuard,
      Reflector,
    ];

    return {
      module: NestPermissionModule,
      global: true,
      imports: [...(asyncOptions.imports ?? []), ...(extraImports ?? [])],
      providers,
      exports: [
        PERMISSION_OPTIONS,
        PERMISSION_EVALUATOR,
        PERMISSION_REPOSITORY,
        PermissionService,
        PermissionsGuard,
        Reflector,
      ],
    };
  }

  private static createAsyncOptionsProviders(options: NestPermissionModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: PERMISSION_OPTIONS,
          useFactory: options.useFactory,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          inject: (options.inject ?? []) as any[],
        },
      ];
    }

    const optionsFactoryProvider: Provider[] = [];

    if (options.useClass) {
      optionsFactoryProvider.push({
        provide: options.useClass,
        useClass: options.useClass,
      });
    }

    const factoryToken = options.useExisting ?? options.useClass;
    if (!factoryToken) {
      throw new Error(
        'NestPermissionModule.forRootAsync() requires one of: useFactory, useClass, or useExisting.',
      );
    }

    return [
      ...optionsFactoryProvider,
      {
        provide: PERMISSION_OPTIONS,
        useFactory: (factory: NestPermissionModuleOptionsFactory) =>
          factory.createPermissionOptions(),
        inject: [factoryToken],
      },
    ];
  }
}
