# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project intends to follow Semantic Versioning after 1.0.0.

## [Unreleased]

### Fixed

- Empty `RequirePermissions`/`RequireAnyPermission` declarations now fail fast instead of
  bypassing authorization; the TypeScript API also requires a non-empty permission tuple.
- Fixed in-memory guard and tenant isolation for empty tenant IDs and values containing `:`,
  and return defensive copies from repository getters.
- Fixed Mongoose named connections by injecting every model from the configured connection.
- Mongoose relation additions now use transaction-scoped idempotent upserts, while role and
  permission cascade deletion is atomic and shares a write-conflict boundary with relation creation.
- Custom evaluator module entry points now forward imported modules required by evaluator dependencies.
- Added Node ESM export conditions for the root and Mongoose entry points.
- Restored `npm run lint` with ESLint flat configuration and TypeScript-aware rules.
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
- **`DefaultPermissionEvaluator` now supports wildcard permissions** (`products.*`, `*`).
  Previously it used exact `Set.has()` matching, so inline `user.permissions` with wildcards
  were silently not expanded. The evaluator now accepts `PERMISSION_OPTIONS` (optional injection)
  and delegates to `matchesPermission()` — the same matcher already used by
  `RepositoryPermissionEvaluator`. Existing behaviour for exact matches is unchanged.

### Added

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
- New test suites: `DefaultPermissionEvaluator` (wildcard/exact/disabled), `matchesPermission`
  edge cases, and `PermissionService` new methods (`listPermissions`, `listRoles`,
  `getDirectPermissions` including tenant isolation). Test count: **32 → 65**.

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
