# nestjs-permission

Permission-based authorization for NestJS, inspired by `spatie/laravel-permission`. It provides roles, direct permissions, wildcard matching, NestJS decorators/guards, and an ORM-independent persistence contract.

> **Status: 0.x beta.** The public API may change before 1.0. Do not treat this package as production-ready until the adapter you use is listed as stable below.

## Support Matrix

| Persistence          | Status                | Notes                                                                                                                          |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| In-memory            | Test/development only | Data is lost on restart. Never use in production.                                                                              |
| MongoDB via Mongoose | Beta                  | Repository and indexed collection schemas are included. Run integration tests with your MongoDB version before production use. |
| Prisma               | Planned               | The CLI generates a repository contract skeleton only; no official repository or migrations are shipped yet.                   |
| TypeORM              | Planned               | The CLI generates a repository contract skeleton only; no official entities or migrations are shipped yet.                     |
| Other databases/IAM  | Community adapter     | Implement `PermissionRepository` and report compatibility feedback.                                                            |

Prisma and TypeORM will cover their supported SQL database drivers through one adapter per ORM. This package does **not** claim native support for every database today.

## Which setup should I use?

If you are new to this package, choose exactly one path:

1. **Quick local demo / tests**: install the package and use `NestPermissionModule.forRoot()`; see [Testing / local development](#testing--local-development).
2. **Real app with MongoDB**: install the package plus `@nestjs/mongoose` and `mongoose`, then use `MongoosePermissionModule.forRoot()`; see [Quickstart (MongoDB)](#quickstart-mongodb).
3. **Custom database / ORM**: implement `PermissionRepository` and use `NestPermissionModule.forRootWithRepository(MyPermissionRepository)`.
4. **Custom permission logic**: use `NestPermissionModule.forRootWithEvaluator(MyEvaluator)`.

| Goal                               | Recommended entry point                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Quick local demo or tests          | `NestPermissionModule.forRoot()` (in-memory, see [Testing](#testing--local-development)) |
| Real application with MongoDB      | `MongoosePermissionModule.forRoot()` (see [Quickstart](#quickstart-mongodb))             |
| Custom ORM/DB adapter              | `NestPermissionModule.forRootWithRepository(MyPermissionRepository)`                     |
| Custom permission evaluation logic | `NestPermissionModule.forRootWithEvaluator(MyEvaluator)`                                 |

> ⚠️ **Pick one integration path.** The CLI-generated module and the manual `MongoosePermissionModule.forRoot()` setup are two ways to wire the same capability; choose one and do not mix them unless you know why.

## Quickstart (MongoDB)

Use this path if you want a real permission backend in a NestJS app.

```bash
npm install @kenzings/nestjs-permission @nestjs/mongoose mongoose
npx @kenzings/nestjs-permission init --database mongoose
```

The CLI detects Mongoose from `package.json` and generates a ready-to-import permission module (it refuses to overwrite existing files). If you ran the CLI, you can use the generated module file from your app. If you did not run the CLI, use the snippet below directly:

```ts
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import { MongoosePermissionModule } from "@kenzings/nestjs-permission/mongoose";
import { PermissionsGuard } from "@kenzings/nestjs-permission";
// If you ran the CLI, you can import your generated permission module here instead of calling MongoosePermissionModule.forRoot() directly.
// import { PermissionModule } from './permission.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI!),
    MongoosePermissionModule.forRoot(),
  ],
  providers: [
    // Register your auth guard (e.g. JwtAuthGuard) BEFORE PermissionsGuard, or after,
    // depending on your provider order — PermissionsGuard reads request.user and expects
    // it to already be populated when it runs.
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
```

> ⚠️ **Guard order matters.** `PermissionsGuard` reads `request.user` — make sure your authentication guard (JWT/Passport/etc.) runs first and populates `request.user` before `PermissionsGuard` runs.
>
> ⚠️ **Fail-open by default.** Routes without `@RequirePermissions` / `@RequireAnyPermission` are allowed through with no check. This preserves NestJS-style opt-in authorization — make sure every sensitive route is explicitly decorated.

The default evaluator resolves permissions from `request.user.id`. Protect a route by declaring the required permissions:

```ts
import { Controller, Get, Post } from "@nestjs/common";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "@kenzings/nestjs-permission";

@Controller("products")
export class ProductsController {
  @Post()
  @RequirePermissions("products.create", "products.publish")
  create() {
    return { ok: true };
  }

  @Get()
  @RequireAnyPermission("products.read", "products.manage")
  findAll() {
    return [];
  }
}
```

`RequirePermissions` requires every permission. `RequireAnyPermission` requires at least one. Wildcards such as `products.*` and `*` are enabled by default. To disable wildcard matching with the Mongoose adapter, pass the option through `permissionOptions`:

```ts
MongoosePermissionModule.forRoot({
  permissionOptions: { wildcardPermissions: false },
});
```

(For `NestPermissionModule.forRoot()` / `forRootWithRepository()`, pass the option directly: `forRoot({ wildcardPermissions: false })`.)

## Permission API

Inject `PermissionService` to manage roles and permissions.

```ts
import { Injectable } from "@nestjs/common";
import { PermissionService } from "@kenzings/nestjs-permission";

@Injectable()
export class UserSetupService {
  constructor(private readonly permissions: PermissionService) {}

  async seed() {
    await this.permissions.createPermission("products.create");
    await this.permissions.createPermission("products.delete");
    await this.permissions.createRole("merchant");

    await this.permissions.givePermissionToRole("merchant", "products.create");
    await this.permissions.assignRole("user-1", "merchant");
    await this.permissions.givePermissionTo("user-1", "products.delete");

    await this.permissions.syncRoles("user-1", ["merchant"]);
    await this.permissions.syncPermissions("merchant", ["products.create"]);
    await this.permissions.hasPermissionTo("user-1", "products.create");
  }
}
```

Common lifecycle methods include `removeRole`, `revokePermissionTo`, `revokePermissionFromRole`, `deleteRole`, `deletePermission`, `getRoles`, `getRolePermissions`, `getAllPermissions`, and `syncDirectPermissions`.

> Note: the built-in Mongoose adapter uses atomic add/remove operations and wraps replace-style mutations in a transaction. If you provide a custom repository without those hooks, avoid calling mutating methods concurrently for the same user/role from multiple requests unless you add your own locking or serialization.

## Production guidance

For production deployments, choose a persistent adapter:

- **Use Mongoose/MongoDB** if your app already uses MongoDB and you want the built-in repository.
- **Use a custom `PermissionRepository`** if your app uses Prisma, TypeORM, PostgreSQL, MySQL, or another database, or if you need tenant scoping, custom locking, or stricter transaction rules.
- **Do not use the in-memory adapter in production**. It is intended for tests, local prototypes, and demos only.

If you need production-grade multi-writer safety, make sure your repository implementation provides its own atomic operations or transaction handling for role/permission updates.

## Testing / local development

For unit tests or quick prototyping without a database, use the in-memory adapter. **Never use this in production** — data is lost on every restart, and there is no persistence guarantee across instances.

```ts
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
  NestPermissionModule,
  PermissionsGuard,
} from "@kenzings/nestjs-permission";

@Module({
  imports: [NestPermissionModule.forRoot()],
  providers: [{ provide: APP_GUARD, useClass: PermissionsGuard }],
})
export class AppModule {}
```

## MongoDB / Mongoose

The Mongoose adapter uses five indexed collections: permissions, roles, role-permissions, user-roles, and user-permissions. Schemas include optional `description`, `metadata`, and `tenantId` fields. `tenantId` is not applied by the core service automatically; extend the repository if authorization must be tenant-scoped.

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
