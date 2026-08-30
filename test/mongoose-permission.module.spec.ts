import { DynamicModule, Type } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { getModelToken } from '@nestjs/mongoose';
import { MongoosePermissionModule } from '../src/mongoose/mongoose-permission.module';
import { MongoosePermissionRepository } from '../src/mongoose/mongoose-permission.repository';
import {
  PERMISSION_MODEL,
  ROLE_MODEL,
  ROLE_PERMISSION_MODEL,
  USER_PERMISSION_MODEL,
  USER_ROLE_MODEL,
} from '../src/mongoose/mongoose-permission.schemas';

describe('MongoosePermissionModule', () => {
  const models = [PERMISSION_MODEL, ROLE_MODEL, ROLE_PERMISSION_MODEL, USER_ROLE_MODEL, USER_PERMISSION_MODEL];

  function effectiveInjectionTokens(repositoryType: Type<MongoosePermissionRepository>): string[] {
    const dependencies = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, repositoryType) as Array<{
      index: number;
      param: string;
    }>;
    const tokens: string[] = [];
    for (const dependency of dependencies) tokens[dependency.index] = dependency.param;
    return tokens;
  }

  it('keeps the exported repository injectable with the default connection', () => {
    expect(effectiveInjectionTokens(MongoosePermissionRepository)).toEqual(
      models.map((model) => getModelToken(model)),
    );
  });

  it('injects every repository model from the configured named connection', () => {
    const connectionName = 'tenant-db';
    const module = MongoosePermissionModule.forRoot({ connectionName });
    const permissionModule = module.imports?.[1] as DynamicModule;
    const repositoryType = permissionModule.providers?.find(
      (provider): provider is Type<MongoosePermissionRepository> =>
        typeof provider === 'function'
        && (provider === MongoosePermissionRepository || provider.prototype instanceof MongoosePermissionRepository),
    );

    expect(repositoryType).toBeDefined();
    expect(effectiveInjectionTokens(repositoryType!)).toEqual(
      models.map((model) => getModelToken(model, connectionName)),
    );
  });
});

describe('MongoosePermissionModule.forRootAsync', () => {
  it('supports forRootAsync with useFactory and named connection', () => {
    const connectionName = 'async-tenant-db';
    const module = MongoosePermissionModule.forRootAsync({
      connectionName,
      useFactory: () => ({
        guardName: 'async-mongoose-guard',
      }),
    });

    const permissionModule = module.imports?.[1] as DynamicModule;
    const repositoryType = permissionModule.providers?.find(
      (provider): provider is Type<MongoosePermissionRepository> =>
        typeof provider === 'function'
        && (provider === MongoosePermissionRepository || provider.prototype instanceof MongoosePermissionRepository),
    );

    expect(repositoryType).toBeDefined();
  });
});
