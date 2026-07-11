# nestjs-permission

Permission-based authorization for NestJS, inspired by `spatie/laravel-permission`. It provides roles, direct permissions, wildcard matching, NestJS decorators/guards, and an ORM-independent persistence contract.

> **Status: 0.x beta.** The public API may change before 1.0. Do not treat this package as production-ready until the adapter you use is listed as stable below.

## Support Matrix

| Persistence | Status | Notes |
| --- | --- | --- |
| In-memory | Test/development only | Data is lost on restart. Never use in production. |
| MongoDB via Mongoose | Beta | Repository and indexed collection schemas are included. Run integration tests with your MongoDB version before production use. |
| Prisma | Planned | The CLI generates a repository contract skeleton only; no official repository or migrations are shipped yet. |
| TypeORM | Planned | The CLI generates a repository contract skeleton only; no official entities or migrations are shipped yet. |
| Other databases/IAM | Community adapter | Implement `PermissionRepository` and report compatibility feedback. |

Prisma and TypeORM will cover their supported SQL database drivers through one adapter per ORM. This package does **not** claim native support for every database today.

## Install

```bash
npm install @kenzings/nest-permission
```

Initialize an integration after installation. The CLI detects Mongoose, Prisma, and TypeORM from the application's `package.json`; it prompts when detection is ambiguous.

```bash
npx @kenzings/nest-permission init
npx @kenzings/nest-permission init --database mongoose
npx @kenzings/nest-permission init --database mongoose --dry-run
```

The CLI refuses to overwrite generated files. Mongoose generates an importable module; Prisma and TypeORM generate a `PermissionRepository` skeleton that must be implemented before use.

## Core Usage

Register the module and apply the guard globally after authentication:

```ts
import { APP_GUARD } from '@nestjs/core';
import { NestPermissionModule, PermissionsGuard } from 'nestjs-permission';

@Module({
  imports: [NestPermissionModule.forRoot()],
  providers: [{ provide: APP_GUARD, useClass: PermissionsGuard }],
})
export class AppModule {}
```

The default evaluator resolves permissions from `request.user.id`.

```ts
@Post()
@RequirePermissions('products.create', 'products.publish')
create() {}

@Get()
@RequireAnyPermission('products.read', 'products.manage')
findAll() {}
```

`RequirePermissions` requires every permission. `RequireAnyPermission` requires at least one. Wildcards such as `products.*` and `*` are enabled by default; set `wildcardPermissions: false` to disable them.

## Permission API

Inject `PermissionService` to manage permission state. Create roles and permissions before assigning them.

```ts
await permissions.createPermission('products.create');
await permissions.createPermission('products.delete');
await permissions.createRole('merchant');

await permissions.givePermissionToRole('merchant', 'products.create');
await permissions.assignRole(userId, 'merchant');
await permissions.givePermissionTo(userId, 'products.delete');

await permissions.syncRoles(userId, ['merchant']);
await permissions.syncPermissions('merchant', ['products.create']);
await permissions.hasPermissionTo(userId, 'products.create');
```

Available lifecycle methods include `removeRole`, `revokePermissionTo`, `revokePermissionFromRole`, `deleteRole`, `deletePermission`, `getRoles`, `getRolePermissions`, `getAllPermissions`, and `syncDirectPermissions`.

## MongoDB / Mongoose

The Mongoose adapter uses five indexed collections: permissions, roles, role-permissions, user-roles, and user-permissions. Schemas include optional `description`, `metadata`, and `tenantId` fields. `tenantId` is not applied by the core service automatically; extend the repository if authorization must be tenant-scoped.

```ts
import { MongoosePermissionModule } from 'nestjs-permission/mongoose';

@Module({
  imports: [MongoosePermissionModule.forRoot()],
})
export class AppModule {}
```

Use a named connection with `MongoosePermissionModule.forRoot({ connectionName: 'tenant-db' })`. For multi-write operations requiring atomicity, extend `MongoosePermissionRepository` and use an application Mongoose session/transaction.

## Custom Adapters

Implement `PermissionRepository`, then register its injectable class:

```ts
@Module({
  imports: [NestPermissionModule.forRootWithRepository(MyPermissionRepository)],
})
export class AppModule {}
```

The contract handles roles, permissions, role-permission links, user-role links, and direct user permissions. The adapter owns database schema, transactions, cache invalidation, and tenant scoping.

## Support And Issues

Before reporting an issue, upgrade to the latest version and create a minimal reproduction. Include:

- Package, NestJS, Node.js, ORM, and database server versions.
- The adapter and relevant configuration.
- Expected and actual behavior, error stack, and reproduction steps.
- A sanitized schema/model definition for database-related failures.

Use the issue templates in this repository for bugs and adapter requests. Security vulnerabilities must not be reported in public issues; contact the maintainer privately once repository contact details are configured.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run build` and `npm test` before opening a pull request. See [CHANGELOG.md](CHANGELOG.md) for release history and known limitations.
