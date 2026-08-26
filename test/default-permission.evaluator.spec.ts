import { DefaultPermissionEvaluator } from '../src/default-permission.evaluator';
import { NestPermissionModuleOptions } from '../src/types';

describe('DefaultPermissionEvaluator', () => {
  const required = { permissions: ['orders.read'], mode: 'all' as const };

  it('fails closed when an all-check has no required permissions', () => {
    const evaluator = new DefaultPermissionEvaluator();

    expect(evaluator.hasPermissions({ permissions: [] }, { permissions: [], mode: 'all' })).toBe(false);
  });

  it('supports exact, any, and wildcard permission matching by default', () => {
    const evaluator = new DefaultPermissionEvaluator();

    expect(evaluator.hasPermissions({ permissions: ['orders.read'] }, required)).toBe(true);
    expect(evaluator.hasPermissions(
      { permissions: ['orders.read'] },
      { permissions: ['orders.cancel', 'orders.read'], mode: 'any' },
    )).toBe(true);
    expect(evaluator.hasPermissions({ permissions: ['orders.*'] }, required)).toBe(true);
  });

  it('can disable wildcard permission matching', () => {
    const ConfigurableEvaluator = DefaultPermissionEvaluator as unknown as new (
      options?: NestPermissionModuleOptions,
    ) => DefaultPermissionEvaluator;
    const evaluator = new ConfigurableEvaluator({ wildcardPermissions: false });

    expect(evaluator.hasPermissions({ permissions: ['orders.*'] }, required)).toBe(false);
  });
});
