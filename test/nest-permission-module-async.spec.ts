import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryPermissionRepository } from '../src/in-memory-permission.repository';
import { NestPermissionModule } from '../src/nest-permission.module';
import { PermissionService } from '../src/permission.service';
import {
  NestPermissionModuleOptions,
  NestPermissionModuleOptionsFactory,
} from '../src/types';

const CONFIG_SERVICE = Symbol('CONFIG_SERVICE');

@Module({
  providers: [{ provide: CONFIG_SERVICE, useValue: { guardName: 'async-guard', wildcardPermissions: false } }],
  exports: [CONFIG_SERVICE],
})
class FakeConfigModule {}

// useFactory pattern helper
function makeFactoryModule(extraImports: unknown[] = []) {
  return NestPermissionModule.forRootAsync({
    imports: [FakeConfigModule, ...extraImports] as never[],
    useFactory: (config: NestPermissionModuleOptions) => config,
    inject: [CONFIG_SERVICE],
  });
}

// useClass pattern helper
@Injectable()
class MyOptionsFactory implements NestPermissionModuleOptionsFactory {
  createPermissionOptions(): NestPermissionModuleOptions {
    return { guardName: 'class-guard', wildcardPermissions: true };
  }
}

@Module({
  providers: [MyOptionsFactory],
  exports: [MyOptionsFactory],
})
class MyOptionsFactoryModule {}

// useExisting pattern helper
@Injectable()
class AnotherFactory implements NestPermissionModuleOptionsFactory {
  createPermissionOptions(): NestPermissionModuleOptions {
    return { guardName: 'existing-guard' };
  }
}

@Module({
  providers: [AnotherFactory],
  exports: [AnotherFactory],
})
class AnotherFactoryModule {}

describe('NestPermissionModule.forRootAsync', () => {
  it('useFactory — resolves options from injected dependency', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [makeFactoryModule()],
    }).compile();

    const service = moduleRef.get(PermissionService);
    expect(service).toBeInstanceOf(PermissionService);

    // guardName from factory should be 'async-guard'
    // Create a permission and verify it works under that guard
    await service.createPermission('test.read');
    await expect(service.listPermissions()).resolves.toContain('test.read');

    await moduleRef.close();
  });

  it('useFactory — async factory (returns Promise) is supported', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestPermissionModule.forRootAsync({
          useFactory: async () => {
            await Promise.resolve(); // simulate async work
            return { guardName: 'async-promise-guard' };
          },
        }),
      ],
    }).compile();

    expect(moduleRef.get(PermissionService)).toBeInstanceOf(PermissionService);
    await moduleRef.close();
  });

  it('useFactory — multiple injected dependencies', async () => {
    const TOKEN_A = Symbol('TOKEN_A');
    const TOKEN_B = Symbol('TOKEN_B');

    @Module({
      providers: [
        { provide: TOKEN_A, useValue: 'multi' },
        { provide: TOKEN_B, useValue: false },
      ],
      exports: [TOKEN_A, TOKEN_B],
    })
    class MultiDepsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        NestPermissionModule.forRootAsync({
          imports: [MultiDepsModule],
          useFactory: (guardName: string, wildcardPermissions: boolean) => ({
            guardName,
            wildcardPermissions,
          }),
          inject: [TOKEN_A, TOKEN_B],
        }),
      ],
    }).compile();

    expect(moduleRef.get(PermissionService)).toBeInstanceOf(PermissionService);
    await moduleRef.close();
  });

  it('useClass — instantiates options factory class via DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestPermissionModule.forRootAsync({
          imports: [MyOptionsFactoryModule],
          useClass: MyOptionsFactory,
        }),
      ],
    }).compile();

    const service = moduleRef.get(PermissionService);
    expect(service).toBeInstanceOf(PermissionService);
    await moduleRef.close();
  });

  it('useExisting — reuses an already-registered options factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestPermissionModule.forRootAsync({
          imports: [AnotherFactoryModule],
          useExisting: AnotherFactory,
        }),
      ],
    }).compile();

    expect(moduleRef.get(PermissionService)).toBeInstanceOf(PermissionService);
    await moduleRef.close();
  });

  it('throws at module creation when no pattern is provided', () => {
    expect(() =>
      NestPermissionModule.forRootAsync({}),
    ).toThrow('useFactory, useClass, or useExisting');
  });

  it('PermissionService and InMemoryPermissionRepository are injectable from the module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestPermissionModule.forRootAsync({
          useFactory: () => ({}),
        }),
      ],
    }).compile();

    expect(moduleRef.get(PermissionService)).toBeInstanceOf(PermissionService);
    expect(moduleRef.get(InMemoryPermissionRepository)).toBeInstanceOf(InMemoryPermissionRepository);
    await moduleRef.close();
  });

  it('forRootAsyncWithRepository — uses custom repository class', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestPermissionModule.forRootAsyncWithRepository(
          InMemoryPermissionRepository,
          { useFactory: () => ({ guardName: 'custom-async' }) },
        ),
      ],
    }).compile();

    expect(moduleRef.get(InMemoryPermissionRepository)).toBeInstanceOf(InMemoryPermissionRepository);
    await moduleRef.close();
  });

  it('forRootAsync and forRoot produce equivalent service behaviour', async () => {
    const syncModule = await Test.createTestingModule({
      imports: [NestPermissionModule.forRoot({ guardName: 'parity' })],
    }).compile();

    const asyncModule = await Test.createTestingModule({
      imports: [NestPermissionModule.forRootAsync({ useFactory: () => ({ guardName: 'parity' }) })],
    }).compile();

    const syncService = syncModule.get(PermissionService);
    const asyncService = asyncModule.get(PermissionService);

    await syncService.createPermission('orders.read');
    await asyncService.createPermission('orders.read');
    await syncService.createRole('viewer');
    await asyncService.createRole('viewer');

    await expect(syncService.listPermissions()).resolves.toEqual(['orders.read']);
    await expect(asyncService.listPermissions()).resolves.toEqual(['orders.read']);

    await syncModule.close();
    await asyncModule.close();
  });
});
