import { matchesPermission } from '../src/permission-matcher';

describe('matchesPermission', () => {
  describe('exact match', () => {
    it('returns true when granted equals requested', () => {
      expect(matchesPermission('products.create', 'products.create')).toBe(true);
    });

    it('returns false when they differ', () => {
      expect(matchesPermission('products.create', 'products.delete')).toBe(false);
    });

    it('returns true for exact match even with wildcard disabled', () => {
      expect(matchesPermission('products.create', 'products.create', false)).toBe(true);
    });
  });

  describe('global wildcard (*)', () => {
    it('matches any permission', () => {
      expect(matchesPermission('*', 'products.create')).toBe(true);
      expect(matchesPermission('*', 'orders.read')).toBe(true);
      expect(matchesPermission('*', 'anything')).toBe(true);
    });

    it('does not match when wildcard is disabled', () => {
      expect(matchesPermission('*', 'products.create', false)).toBe(false);
    });
  });

  describe('namespace wildcard (prefix.*)', () => {
    it('matches permissions under the namespace', () => {
      expect(matchesPermission('products.*', 'products.create')).toBe(true);
      expect(matchesPermission('products.*', 'products.delete')).toBe(true);
    });

    it('does not match permissions in a different namespace', () => {
      expect(matchesPermission('products.*', 'orders.read')).toBe(false);
    });

    it('does not match the namespace itself without a suffix', () => {
      expect(matchesPermission('products.*', 'products')).toBe(false);
    });

    it('does not match when wildcard is disabled', () => {
      expect(matchesPermission('products.*', 'products.create', false)).toBe(false);
    });

    it('does not treat a non-wildcard suffix as a wildcard', () => {
      expect(matchesPermission('products.create', 'products.create.extra')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('empty strings are equal', () => {
      expect(matchesPermission('', '')).toBe(true);
    });

    it('empty granted does not match non-empty requested', () => {
      expect(matchesPermission('', 'products.create')).toBe(false);
    });
  });
});
