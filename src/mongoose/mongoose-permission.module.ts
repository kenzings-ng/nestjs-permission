import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NestPermissionModule } from '../nest-permission.module';
import { NestPermissionModuleOptions } from '../types';
import { MongoosePermissionRepository } from './mongoose-permission.repository';
import {
  PERMISSION_MODEL,
  PermissionSchema,
  ROLE_MODEL,
  ROLE_PERMISSION_MODEL,
  RolePermissionSchema,
  RoleSchema,
  USER_PERMISSION_MODEL,
  UserPermissionSchema,
  USER_ROLE_MODEL,
  UserRoleSchema,
} from './mongoose-permission.schemas';

export interface MongoosePermissionModuleOptions {
  connectionName?: string;
  permissionOptions?: NestPermissionModuleOptions;
}

@Module({})
export class MongoosePermissionModule {
  static forRoot(options: MongoosePermissionModuleOptions = {}): DynamicModule {
    const mongooseModels = MongooseModule.forFeature([
      { name: PERMISSION_MODEL, schema: PermissionSchema },
      { name: ROLE_MODEL, schema: RoleSchema },
      { name: ROLE_PERMISSION_MODEL, schema: RolePermissionSchema },
      { name: USER_ROLE_MODEL, schema: UserRoleSchema },
      { name: USER_PERMISSION_MODEL, schema: UserPermissionSchema },
    ], options.connectionName);

    const permissionModule = NestPermissionModule.forRootWithRepository(
      MongoosePermissionRepository,
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
