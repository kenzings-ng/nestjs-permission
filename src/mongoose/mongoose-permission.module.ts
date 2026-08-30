import { DynamicModule, Injectable, Module, ModuleMetadata } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NestPermissionModule } from '../nest-permission.module';
import {
  NestPermissionModuleAsyncOptions,
  NestPermissionModuleOptions,
  NestPermissionModuleOptionsFactory,
} from '../types';
import { MongoosePermissionRepository } from './mongoose-permission.repository';
import {
  PERMISSION_MODEL,
  NamedDocument,
  PermissionSchema,
  ROLE_MODEL,
  ROLE_PERMISSION_MODEL,
  RolePermissionDocument,
  RolePermissionSchema,
  RoleSchema,
  USER_PERMISSION_MODEL,
  UserPermissionDocument,
  UserPermissionSchema,
  USER_ROLE_MODEL,
  UserRoleDocument,
  UserRoleSchema,
} from './mongoose-permission.schemas';

function repositoryForConnection(connectionName?: string): typeof MongoosePermissionRepository {
  @Injectable()
  class ConfiguredMongoosePermissionRepository extends MongoosePermissionRepository {
    constructor(
      @InjectModel(PERMISSION_MODEL, connectionName) permissions: Model<NamedDocument>,
      @InjectModel(ROLE_MODEL, connectionName) roles: Model<NamedDocument>,
      @InjectModel(ROLE_PERMISSION_MODEL, connectionName) rolePermissions: Model<RolePermissionDocument>,
      @InjectModel(USER_ROLE_MODEL, connectionName) userRoles: Model<UserRoleDocument>,
      @InjectModel(USER_PERMISSION_MODEL, connectionName) userPermissions: Model<UserPermissionDocument>,
    ) {
      super(permissions, roles, rolePermissions, userRoles, userPermissions);
    }
  }

  return ConfiguredMongoosePermissionRepository;
}

function mongooseModels(connectionName?: string) {
  return MongooseModule.forFeature(
    [
      { name: PERMISSION_MODEL, schema: PermissionSchema },
      { name: ROLE_MODEL, schema: RoleSchema },
      { name: ROLE_PERMISSION_MODEL, schema: RolePermissionSchema },
      { name: USER_ROLE_MODEL, schema: UserRoleSchema },
      { name: USER_PERMISSION_MODEL, schema: UserPermissionSchema },
    ],
    connectionName,
  );
}

export interface MongoosePermissionModuleOptions {
  connectionName?: string;
  permissionOptions?: NestPermissionModuleOptions;
}

export interface MongoosePermissionModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  connectionName?: string;
  /**
   * Factory function returning `NestPermissionModuleOptions`.
   * Useful when options depend on ConfigService or other async providers.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory?: (...args: any[]) => Promise<NestPermissionModuleOptions> | NestPermissionModuleOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inject?: any[];
  useClass?: import('@nestjs/common').Type<NestPermissionModuleOptionsFactory>;
  useExisting?: import('@nestjs/common').Type<NestPermissionModuleOptionsFactory>;
}

@Module({})
export class MongoosePermissionModule {
  /** Registers the Mongoose-backed permission module with synchronous options. */
  static forRoot(options: MongoosePermissionModuleOptions = {}): DynamicModule {
    const repository = repositoryForConnection(options.connectionName);
    const models = mongooseModels(options.connectionName);

    const permissionModule = NestPermissionModule.forRootWithRepository(
      repository,
      options.permissionOptions,
      [models],
    );

    return {
      module: MongoosePermissionModule,
      imports: [models, permissionModule],
      exports: [permissionModule],
    };
  }

  /**
   * Registers the Mongoose-backed permission module with asynchronous options.
   * Use this when `permissionOptions` depend on ConfigService or other async providers.
   *
   * @example
   * MongoosePermissionModule.forRootAsync({
   *   connectionName: 'tenant-db',
   *   imports: [ConfigModule],
   *   useFactory: (config: ConfigService) => ({
   *     guardName: config.get('PERMISSION_GUARD'),
   *     wildcardPermissions: config.get<boolean>('WILDCARD'),
   *   }),
   *   inject: [ConfigService],
   * })
   */
  static forRootAsync(options: MongoosePermissionModuleAsyncOptions = {}): DynamicModule {
    const repository = repositoryForConnection(options.connectionName);
    const models = mongooseModels(options.connectionName);

    const asyncPermissionOptions: NestPermissionModuleAsyncOptions = {
      imports: [...(options.imports ?? []), models],
      ...(options.useFactory
        ? { useFactory: options.useFactory, inject: options.inject }
        : options.useClass
          ? { useClass: options.useClass }
          : { useExisting: options.useExisting }),
    };

    const permissionModule = NestPermissionModule.forRootAsyncWithRepository(
      repository,
      asyncPermissionOptions,
    );

    return {
      module: MongoosePermissionModule,
      imports: [models, permissionModule],
      exports: [permissionModule],
    };
  }
}
