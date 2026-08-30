# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project intends to follow Semantic Versioning after 1.0.0.

## [Unreleased]

## [0.3.0]

### Added

- **`NestPermissionModule.forRootAsync(options)`** — registers the module with asynchronous options.
  Supports `useFactory` (with `inject`), `useClass`, and `useExisting` patterns. Allows
  deriving `guardName`, `wildcardPermissions`, and `userProperty` from `ConfigService` or any
  other async/dynamic provider without timing issues.
- **`NestPermissionModule.forRootAsyncWithRepository(repository, options)`** — async variant of
  `forRootWithRepository`, combining a custom `PermissionRepository` class with async core options.
- **`MongoosePermissionModule.forRootAsync(options)`** — async variant of
  `MongoosePermissionModule.forRoot`. Supports all three async patterns and accepts an optional
  `connectionName` alongside the async options.
- **`NestPermissionModuleAsyncOptions`** and **`NestPermissionModuleOptionsFactory`** interfaces
  exported from the main entry point, enabling typed `useClass`/`useExisting` implementations.
- **`PermissionService.getDirectPermissions(userId)`** — returns only the permissions granted
  directly to the user, without merging role-inherited permissions. Useful for admin UIs and
  audit logs that need to distinguish the two sources. Tenant-scoped when called on a scoped
  service returned by `forTenant()`.
- **`PermissionService.listPermissions()`** — returns all defined permission names for the
  active guard. Delegates to the optional `PermissionRepository.listPermissions?()` hook;
  returns `undefined` when the repository doesn't implement it.
- **`PermissionService.listRoles()`** — returns all defined role names for the active guard.
  Delegates to the optional `PermissionRepository.listRoles?()` hook; returns `undefined`
  when the repository doesn't implement it.
- **`PermissionRepository.listPermissions?` and `listRoles?`** optional methods added to the
  repository contract. Both `InMemoryPermissionRepository` and `MongoosePermissionRepository`
  now implement them.
- Comprehensive JSDoc on all public `PermissionService` methods, improving IDE hover
  documentation and discoverability.

### Fixed

- **`DefaultPermissionEvaluator` now supports wildcard permissions** (`products.*`, `*`).
  Previously it used exact `Set.has()` matching, so inline `user.permissions` with wildcards
  were silently not expanded. The evaluator now accepts `PERMISSION_OPTIONS` (optional injection)
  and delegates to `matchesPermission()` — the same matcher already used by
  `RepositoryPermissionEvaluator`. Existing behaviour for exact matches is unchanged.

## [0.2.1] - 2026-08-26

### Fixed

- Empty `hasAllPermissions`, `hasAllRoles`, and built-in evaluator requirements now deny access
  instead of succeeding through empty-array matching.
- `DefaultPermissionEvaluator` now honors wildcard permission matching and the
  `wildcardPermissions` option while retaining its existing public API.

### Added

- MongoDB replica-set integration tests for Mongoose transactions, tenant isolation, idempotent
  concurrent grants, and cascade deletion.
- CI quality checks and compatibility coverage for supported Node.js, NestJS, and Mongoose versions.

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
