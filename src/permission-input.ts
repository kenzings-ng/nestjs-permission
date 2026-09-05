import { BadRequestException } from '@nestjs/common';
import { Permission, PermissionSubjectId } from './types';

/**
 * Guards against untrusted non-string values reaching a persistence filter.
 *
 * Names, guard names and tenant ids are used as *filter values* by the repository adapters.
 * MongoDB (and therefore Mongoose) treats a plain object in that position as a query operator
 * rather than a literal, so a value such as `{ $ne: null }` widens a filter instead of
 * narrowing it — turning an existence check into "any document" and a tenant-scoped read into
 * a cross-tenant read. Requiring a primitive string closes that class of injection for every
 * adapter, not just the Mongoose one.
 */
export function isPermissionString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Subject ids are stringified before use, so only primitives that stringify unambiguously are accepted. */
export function isSubjectId(value: unknown): value is PermissionSubjectId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

export function assertPermissionString(value: unknown, label: string): string {
  if (!isPermissionString(value)) {
    throw new BadRequestException(`${label} must be a string, received ${describe(value)}.`);
  }
  return value;
}

export function assertPermissionStrings(values: unknown, label: string): string[] {
  if (!Array.isArray(values)) {
    throw new BadRequestException(`${label} must be an array of strings, received ${describe(values)}.`);
  }
  return values.map((value) => assertPermissionString(value, label));
}

export function assertSubjectId(value: unknown, label = 'userId'): PermissionSubjectId {
  if (!isSubjectId(value)) {
    throw new BadRequestException(`${label} must be a string or a finite number, received ${describe(value)}.`);
  }
  return value;
}

/** `undefined` is the legitimate "global / tenant-less" scope; anything else must be a string. */
export function assertOptionalTenantId(value: unknown, label = 'tenantId'): string | undefined {
  return value === undefined ? undefined : assertPermissionString(value, label);
}

/**
 * Builds a permission set from an untrusted `user.permissions` value, dropping anything that is
 * not a string.
 *
 * A bare string is deliberately rejected rather than iterated: `new Set('admin')` yields the
 * character set `{a, d, m, i, n}`, which can accidentally satisfy a single-character permission.
 * Failing closed here is safer than silently matching on characters.
 */
export function toPermissionSet(value: unknown): Set<Permission> {
  const permissions = new Set<Permission>();
  if (value === null || value === undefined || typeof value === 'string') return permissions;
  if (typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') return permissions;
  for (const item of value as Iterable<unknown>) {
    if (isPermissionString(item)) permissions.add(item);
  }
  return permissions;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}
