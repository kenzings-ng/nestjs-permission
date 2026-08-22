import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryPermissionRepository } from '../src/in-memory-permission.repository';
import { NestPermissionModule } from '../src/nest-permission.module';
import { PermissionEvaluator, PermissionUser, RequiredPermissions } from '../src/types';

const EVALUATOR_DEPENDENCY = Symbol('EVALUATOR_DEPENDENCY');

@Module({
  providers: [{ provide: EVALUATOR_DEPENDENCY, useValue: true }],
  exports: [EVALUATOR_DEPENDENCY],
})
class EvaluatorDependencyModule {}

@Injectable()
class ImportedDependencyEvaluator implements PermissionEvaluator {
  constructor(@Inject(EVALUATOR_DEPENDENCY) private readonly allowed: boolean) {}

  hasPermissions(_user: PermissionUser | undefined, _required: RequiredPermissions): boolean {
    return this.allowed;
  }
}

describe('NestPermissionModule custom provider imports', () => {
  it.each([
    [
      'forRootWithEvaluator',
      () => NestPermissionModule.forRootWithEvaluator(
        ImportedDependencyEvaluator,
        {},
        [EvaluatorDependencyModule],
      ),
    ],
    [
      'forRootWithRepositoryAndEvaluator',
      () => NestPermissionModule.forRootWithRepositoryAndEvaluator(
        InMemoryPermissionRepository,
        ImportedDependencyEvaluator,
        {},
        [EvaluatorDependencyModule],
      ),
    ],
  ])('%s forwards imports needed by a custom evaluator', async (_name, createModule) => {
    const testingModule = await Test.createTestingModule({ imports: [createModule()] }).compile();

    expect(testingModule.get(ImportedDependencyEvaluator)).toBeInstanceOf(ImportedDependencyEvaluator);
    await testingModule.close();
  });
});
