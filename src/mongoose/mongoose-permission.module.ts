import { DynamicModule, Injectable, Module } from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NestPermissionModule } from '../nest-permission.module';
import { NestPermissionModuleOptions } from '../types';
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

export interface MongoosePermissionModuleOptions {
  connectionName?: string;
  permissionOptions?: NestPermissionModuleOptions;
}

@Module({})
export class MongoosePermissionModule {
  static forRoot(options: MongoosePermissionModuleOptions = {}): DynamicModule {
    const repository = repositoryForConnection(options.connectionName);
    const mongooseModels = MongooseModule.forFeature([
      { name: PERMISSION_MODEL, schema: PermissionSchema },
      { name: ROLE_MODEL, schema: RoleSchema },
      { name: ROLE_PERMISSION_MODEL, schema: RolePermissionSchema },
      { name: USER_ROLE_MODEL, schema: UserRoleSchema },
      { name: USER_PERMISSION_MODEL, schema: UserPermissionSchema },
    ], options.connectionName);

    const permissionModule = NestPermissionModule.forRootWithRepository(
      repository,
      options.permissionOptions,
      [mongooseModels],
    );

    return {
      module: MongoosePermissionModule,
      imports: [mongooseModels, permissionModule],
      exports: [permissionModule],
    };
  }
}
