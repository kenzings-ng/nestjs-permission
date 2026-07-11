# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project intends to follow Semantic Versioning after 1.0.0.

## [Unreleased]

### Planned

- Official Prisma adapter with schema generator, migrations, and integration tests.
- Official TypeORM adapter with entities, migrations, and integration tests.
- Cache invalidation contract and Redis reference adapter.
- Tenant-aware core repository contract.

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
- The core service does not apply `tenantId`; tenant-scoped behavior must be implemented by the adapter.
