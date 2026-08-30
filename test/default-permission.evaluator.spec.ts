import { DefaultPermissionEvaluator } from '../src/default-permission.evaluator';
import { NestPermissionModuleOptions, RequiredPermissions } from '../src/types';

describe('DefaultPermissionEvaluator', () => {
  const required: RequiredPermissions = { permissions: ['orders.read'], mode: 'all' };

  it('fails closed when an all-check has no required permissions', () => {
    const evaluator = new DefaultPermissionEvaluator();

    expect(evaluator.hasPermissions({ permissions: [] }, { permissions: [], mode: 'all' })).toBe(false);
  });

  describe('without options (wildcard enabled by default)', () => {
    const evaluator = new DefaultPermissionEvaluator();

    const all: RequiredPermissions = { permissions: ['products.create'], mode: 'all' };
    const any: RequiredPermissions = { permissions: ['products.create', 'products.delete'], mode: 'any' };

    it('denies when user is undefined', () => {
      expect(evaluator.hasPermissions(undefined, all)).toBe(false);
    });

    it('denies when user has no permissions', () => {
      expect(evaluator.hasPermissions({ permissions: [] }, all)).toBe(false);
    });

    it('allows exact permission match (mode: all)', () => {
      expect(evaluator.hasPermissions({ permissions: ['products.create'] }, all)).toBe(true);
    });

    it('denies missing permission (mode: all)', () => {
      expect(evaluator.hasPermissions({ permissions: ['products.read'] }, all)).toBe(false);
    });

    it('allows when any permission matches (mode: any)', () => {
      expect(evaluator.hasPermissions({ permissions: ['products.delete'] }, any)).toBe(true);
    });

    it('supports namespace wildcard products.* granting products.create', () => {
      expect(evaluator.hasPermissions({ permissions: ['products.*'] }, all)).toBe(true);
    });

    it('supports global wildcard * granting products.create', () => {
      expect(evaluator.hasPermissions({ permissions: ['*'] }, all)).toBe(true);
    });

    it('namespace wildcard does not bleed across namespaces', () => {
      expect(
        evaluator.hasPermissions(
          { permissions: ['orders.*'] },
          { permissions: ['products.create'], mode: 'all' },
        ),
      ).toBe(false);
    });

    it('works correctly with mode any and wildcard', () => {
      expect(
        evaluator.hasPermissions(
          { permissions: ['products.*'] },
          { permissions: ['orders.read', 'products.delete'], mode: 'any' },
        ),
      ).toBe(true);
    });
  });

  describe('with wildcardPermissions: false', () => {
    const ConfigurableEvaluator = DefaultPermissionEvaluator as unknown as new (
      options?: NestPermissionModuleOptions,
    ) => DefaultPermissionEvaluator;
    const evaluator = new ConfigurableEvaluator({ wildcardPermissions: false });

    it('does not expand namespace wildcards when disabled', () => {
      expect(
        evaluator.hasPermissions(
          { permissions: ['products.*'] },
          { permissions: ['products.create'], mode: 'all' },
        ),
      ).toBe(false);
    });

    it('still allows exact matches', () => {
      expect(
        evaluator.hasPermissions(
          { permissions: ['products.create'] },
          { permissions: ['products.create'], mode: 'all' },
        ),
      ).toBe(true);
    });

    it('cannot match wildcard with required orders.read', () => {
      expect(evaluator.hasPermissions({ permissions: ['orders.*'] }, required)).toBe(false);
    });
  });
});
