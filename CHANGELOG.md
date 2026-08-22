# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project intends to follow Semantic Versioning after 1.0.0.

## [Unreleased]

### Fixed

- `nest-permission init --database prisma|typeorm` now generates a `PermissionRepository`
  skeleton whose user-assignment methods include the `tenantId?: string` parameter, matching
  the core contract. The previous skeleton compiled (the parameter is optional) but silently
  produced a non-tenant-aware adapter, since TypeScript does not require an implementation to
  declare an optional parameter it never reads.
- Added dedicated unit tests for `RepositoryPermissionEvaluator` covering the tenant-routing
  path (`user.tenantId` → `PermissionService.forTenant()`), tenant isolation, wildcard matching
  under a tenant scope, and the `user.permissions` pass-through path. Previously only
  `PermissionService.forTenant()` itself was covered; the guard/evaluator wiring that reads
  `request.user.tenantId` had no direct test.

### Planned

- Official Prisma adapter with schema generator, migrations, and integration tests.
- Official TypeORM adapter with entities, migrations, and integration tests.
- Cache invalidation contract and Redis reference adapter.
- MongoDB integration tests for the Mongoose adapter's tenant filtering (currently covered
  only indirectly through the in-memory repository).

## [0.1.2]

### Added

- Tenant-aware core: `PermissionService.forTenant(tenantId)`, `tenantId` threaded through
  `PermissionRepository`'s user-assignment methods, `PermissionsGuard`/`RepositoryPermissionEvaluator`
  reading `request.user.tenantId`, and Mongoose schema/repository tenant scoping with a
  `(subjectId, roleId|permissionId, guardName, tenantId)` unique index. `tenantId: undefined`
  is treated as the global (tenant-less) scope, distinct from any named tenant.
- Atomic `addUserRoles`/`removeUserRoles`/`addUserPermissions`/`removeUserPermissions` in the
  Mongoose adapter, used by `PermissionService` instead of read-modify-write when available.

### Known Limitations

- Permission and role *definitions* (and role↔permission grants) are shared across tenants by
  design; only user↔role and user↔permission *assignments* are tenant-scoped. This matches the
  documented model but is worth confirming against your requirements before adoption.
- `PermissionService.forTenant()` constructs a scoped instance with `new` rather than through
  Nest's DI container. This works today because the constructor only takes the repository and
  options, but it means the class can't gain additional DI-injected dependencies without also
  updating `forTenant()`.

## [0.1.0] - 2026-07-11

### Added

- `RequirePermissions` and `RequireAnyPermission` decorators with `PermissionsGuard`.
- `PermissionService` role, direct-permission, sync, revoke, and delete APIs.
- Wildcard permission matching for `*` and namespace wildcards such as `products.*`.
- ORM-independent `PermissionRepository` contract and in-memory test/development adapter.
- Mongoose repository, indexed schemas, and `MongoosePermissionModule`.
- `nest-permission init` CLI with ORM detection and safe generated-file behavior.

### Known Limitations

- The in-memory repository is not persistent and is unsuitable for production.
- Mongoose support is beta and lacks MongoDB integration tests in this repository.
- Prisma and TypeORM are not official adapters yet; their CLI output is a skeleton only.
