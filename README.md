# nestjs-permission

Permission-based authorization for NestJS, inspired by `spatie/laravel-permission`. It provides roles, direct permissions, wildcard matching, NestJS decorators/guards, and a database-agnostic persistence contract.

> **Status: 0.x beta.** The public API may change before 1.0.

## Philosophy: bring your own database

This package does **not** ship an adapter for every database. Instead, all storage goes through one small interface — `PermissionRepository` — and you implement it for whatever you use: MySQL, MariaDB, PostgreSQL, SQLite, MongoDB, DynamoDB, Redis, an external IAM service, anything. The core (decorators, guard, wildcard matching, `PermissionService`) never talks to a database directly.

Two adapters are included:

| Adapter                    | Purpose                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| In-memory                  | Tests, prototypes, demos. Data is lost on restart — never use in production.                    |
| Mongoose (MongoDB)         | A production-oriented reference adapter. Also useful as a template for writing your own.        |

Everything else is your own `PermissionRepository` implementation. The [Implementing your own adapter](#implementing-your-own-adapter) section covers the generic data model for both SQL and NoSQL databases.

## How it works

```
@RequirePermissions("products.create")     ← decorator on a route
        │
PermissionsGuard                           ← reads request.user
        │
PermissionEvaluator                        ← decides allow/deny (replaceable)
        │
PermissionService                          ← roles, permissions, wildcard logic
        │
PermissionRepository                       ← the only thing that touches storage (yours)
```

You pick the entry point that matches how much you want to customize:

| Goal                                     | Entry point                                                          |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Quick demo or unit tests (no database)   | `NestPermissionModule.forRoot()` (in-memory)                          |
| MongoDB with the built-in adapter        | `MongoosePermissionModule.forRoot()`                                  |
| Any other database (SQL or NoSQL)        | `NestPermissionModule.forRootWithRepository(MyPermissionRepository)`  |
| Custom allow/deny logic                  | `NestPermissionModule.forRootWithEvaluator(MyEvaluator)`              |
| Both custom storage and custom logic     | `NestPermissionModule.forRootWithRepositoryAndEvaluator(...)`         |

## Installation

```bash
npm install @kenzings/nestjs-permission
# only if you use the built-in Mongoose adapter:
npm install @nestjs/mongoose mongoose
```

## Quick start (in-memory, no database)

The fastest way to try the package or write tests:

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

For a real application, swap the in-memory storage for a persistent repository — see the next two sections. Everything else (decorators, guard, `PermissionService`) stays the same.

## Wiring up authentication

`PermissionsGuard` reads the authenticated user from `request.user` and resolves their permissions by `request.user.id`. Two rules:

1. **Your authentication guard must run first** and populate `request.user` with an `id` (string or number) — the same ID you pass to `PermissionService` methods.
2. **Routes without a permission decorator are allowed through** (fail-open, standard NestJS opt-in style). Decorate every sensitive route.

```ts
providers: [
  { provide: APP_GUARD, useClass: YourAuthGuard },      // runs first, sets request.user
  { provide: APP_GUARD, useClass: PermissionsGuard },   // then checks permissions
],
```

If your app stores the user on another request property, set `userProperty`:

```ts
NestPermissionModule.forRoot({ userProperty: "currentUser" });
```

## Protecting routes

```ts
import { Controller, Get, Post } from "@nestjs/common";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "@kenzings/nestjs-permission";

@Controller("products")
export class ProductsController {
  @Post()
  @RequirePermissions("products.create", "products.publish") // must have ALL
  create() {
    return { ok: true };
  }

  @Get()
  @RequireAnyPermission("products.read", "products.manage") // must have AT LEAST ONE
  findAll() {
    return [];
  }
}
```

Both decorators honor [wildcard permissions](#wildcard-permissions).

## Basic usage

Inject `PermissionService` anywhere in your app to define and assign permissions. Permissions and roles must be created before they can be assigned — assigning an unknown name throws a `NotFoundException`.

```ts
import { Injectable } from "@nestjs/common";
import { PermissionService } from "@kenzings/nestjs-permission";

@Injectable()
export class UserSetupService {
  constructor(private readonly permissions: PermissionService) {}
}
```

### Direct permissions

Grant a permission straight to a user:

```ts
await this.permissions.createPermission("products.delete");
await this.permissions.givePermissionTo("user-1", "products.delete");

await this.permissions.hasPermissionTo("user-1", "products.delete"); // true
await this.permissions.revokePermissionTo("user-1", "products.delete");
```

### Using permissions via roles

The recommended day-to-day model (see [Roles vs permissions](#best-practices-roles-vs-permissions)): group permissions into roles, assign roles to users. A user's effective permissions are their direct permissions plus everything inherited from their roles — `hasPermissionTo` and the guard treat both the same.

```ts
await this.permissions.createPermission("products.create");
await this.permissions.createRole("merchant");

await this.permissions.givePermissionToRole("merchant", "products.create");
await this.permissions.assignRole("user-1", "merchant");

await this.permissions.hasPermissionTo("user-1", "products.create"); // true, via the role
```

### Syncing

`sync*` methods replace the full assignment set in one call, while `give`/`assign`/`revoke`/`remove` change one entry at a time:

```ts
await this.permissions.syncRoles("user-1", ["merchant"]);            // user now has exactly these roles
await this.permissions.syncPermissions("merchant", ["products.create"]); // role now has exactly these permissions
await this.permissions.syncDirectPermissions("user-1", []);          // clears direct permissions
```

### Checking permissions and roles

For checks outside of guarded routes (services, resolvers, scripts):

```ts
await this.permissions.hasPermissionTo("user-1", "products.create");
await this.permissions.hasAnyPermission("user-1", "products.create", "products.delete");
await this.permissions.hasAllPermissions("user-1", "products.create", "products.delete");

await this.permissions.hasRole("user-1", "merchant");
await this.permissions.hasAnyRole("user-1", "merchant", "admin");
await this.permissions.hasAllRoles("user-1", "merchant", "admin");
```

All permission checks honor wildcards the same way the guard does. Role checks are exact-name matches.

### Method reference

| Category            | Methods                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Define              | `createPermission`, `deletePermission`, `createRole`, `deleteRole`                                     |
| Role ↔ permission   | `givePermissionToRole`, `revokePermissionFromRole`, `syncPermissions`, `getRolePermissions`            |
| User ↔ role         | `assignRole`, `removeRole`, `syncRoles`, `getRoles`                                                    |
| User ↔ permission   | `givePermissionTo`, `revokePermissionTo`, `syncDirectPermissions`, `getAllPermissions`                 |
| Checks              | `hasPermissionTo`, `hasAnyPermission`, `hasAllPermissions`, `hasRole`, `hasAnyRole`, `hasAllRoles`     |
| Tenancy             | `forTenant` (see [Multi-tenancy](#multi-tenancy))                                                      |

## Wildcard permissions

Enabled by default. A granted permission ending in `.*` matches every permission under that prefix, and a bare `*` matches everything:

```ts
await this.permissions.createPermission("products.*");
await this.permissions.givePermissionTo("user-1", "products.*");

await this.permissions.hasPermissionTo("user-1", "products.create"); // true
await this.permissions.hasPermissionTo("user-1", "orders.create");   // false
```

Granting `*` to a user (or a role such as `super-admin`) effectively bypasses every permission check — a simple way to model a super-admin.

Disable wildcard matching entirely with `{ wildcardPermissions: false }`; then only exact names match.

## Using multiple guards

Every role, permission, and assignment is namespaced by a `guardName` (default `'default'`). Data under one guard name is invisible to another — useful when the same application serves separate audiences (e.g. an admin panel and a public API) with independent permission sets.

Set it per module registration:

```ts
NestPermissionModule.forRoot({ guardName: "admin" });
// or through the Mongoose module:
MongoosePermissionModule.forRoot({ permissionOptions: { guardName: "admin" } });
```

One module registration works with one guard name; all `PermissionService` calls and guard checks in that app use it implicitly. Adapters must scope every query by `guardName` — the built-in adapters already do.

## Multi-tenancy

For applications where the same user has different access per tenant (workspace, team, organization), scope a service with `forTenant`:

- **Permission and role definitions are shared** across tenants (created once, per guard name).
- **User assignments (user↔role, user↔permission) are stored per tenant.** The global (tenant-less) scope and each tenant scope are fully isolated from one another.

```ts
await this.permissions.createRole("editor");                       // defined once, shared

const workspace = this.permissions.forTenant("workspace-42");
await workspace.assignRole("user-1", "editor");                    // only within workspace-42

await workspace.hasRole("user-1", "editor");                       // true
await this.permissions.hasRole("user-1", "editor");                // false — global scope
await this.permissions.forTenant("workspace-7").hasRole("user-1", "editor"); // false
```

To make route guards tenant-aware, have your authentication guard set `tenantId` on the request user (for example from the subdomain, a header, or the JWT):

```ts
request.user = { id: payload.sub, tenantId: payload.workspaceId };
```

When `request.user.tenantId` is present, `PermissionsGuard` checks the user's assignments within that tenant; when absent, it checks the global scope — existing apps keep working unchanged.

If you implement a custom adapter, the user-assignment methods receive the tenant as an optional trailing `tenantId` parameter — see [The contract](#the-contract).

## Best practices: roles vs permissions

Borrowed from `spatie/laravel-permission`, and it applies unchanged here:

- **Check permissions in code, not roles.** Decorate routes with `@RequirePermissions("articles.edit")`, not "is this user an editor?". Code stays stable while business rules change.
- **Assign permissions to roles, and roles to users.** Roles are how humans group access ("editor", "merchant"); permissions are what code actually checks. When the definition of "editor" changes, you update one role instead of every route.
- **Use direct user permissions sparingly** — for one-off exceptions, not as the primary model.
- **Name permissions after actions**, e.g. `articles.edit`, `orders.refund`. The dot convention also gives you wildcard grouping (`articles.*`) for free.


## Implementing your own adapter

This is the intended path for every database the package does not ship an adapter for. Implement `PermissionRepository` and register it:

```ts
@Module({
  imports: [NestPermissionModule.forRootWithRepository(MyPermissionRepository)],
})
export class AppModule {}
```

The CLI can generate a typed skeleton to start from (every method throws until you implement it):

```bash
npx @kenzings/nestjs-permission init --database prisma   # or typeorm
```

### The data model

Whatever the database, your adapter persists five concepts:

| Concept            | Meaning                                  | Uniqueness to enforce                        |
| ------------------ | ----------------------------------------- | --------------------------------------------- |
| `permissions`      | a named permission                        | `(name, guard_name)`                          |
| `roles`            | a named role                              | `(name, guard_name)`                          |
| `role_permissions` | permission granted to a role              | `(role_id, permission_id, guard_name)`        |
| `user_roles`       | role assigned to a user                   | `(subject_id, role_id, guard_name)`           |
| `user_permissions` | permission granted directly to a user     | `(subject_id, permission_id, guard_name)`     |

- Every read and write is scoped by `guardName` (a namespace, default `'default'`). Never let one guard's data leak into another.
- Store `subjectId` as a stable string form of your application's user ID.
- **SQL databases**: the table above maps directly to five tables with the listed unique constraints. Model the three link tables as join tables with foreign keys; deleting a role/permission must also delete its rows in the link tables.
- **NoSQL databases**: use whatever shape is natural (separate collections like the Mongoose adapter, or embedded arrays per user/role) as long as reads return the same results and uniqueness is enforced. The built-in Mongoose adapter (`src/mongoose/`) is a working example of the separate-collections approach.

### The contract

Required methods — the core works with only these:

```ts
createPermission / deletePermission / permissionExists
createRole / deleteRole / roleExists
setRolePermissions / getRolePermissions
setUserRoles / getUserRoles
setUserPermissions / getUserPermissions
```

Optional methods — implement these as atomic single-row inserts/deletes for safe concurrent updates. When present, `PermissionService` uses them instead of read-modify-write on the `set*` methods:

```ts
addRolePermissions / removeRolePermissions
addUserRoles / removeUserRoles
addUserPermissions / removeUserPermissions
```

Guidelines:

- Wrap each replace-style `set*` method in a transaction (or an equivalent atomic operation) so a failure cannot leave partial assignments.
- `delete*` must clean up related link rows, scoped to the same `guardName` (across all tenants — the definition itself is gone).
- The user-assignment methods (`setUserRoles`, `getUserRoles`, `setUserPermissions`, `getUserPermissions`, and their `add*`/`remove*` variants) receive an optional trailing `tenantId?: string`. When set, read and write only that tenant's rows; when `undefined`, only tenant-less rows. Add a nullable `tenant_id` column to `user_roles`/`user_permissions` and include it in their unique keys if you use [multi-tenancy](#multi-tenancy); ignore the parameter if you don't.
- Caching and locking are the adapter's responsibility — the core service does not add them.
- Before production, add integration tests against the exact database version you deploy: assignment, revocation, deletion cleanup, guard-name isolation, and concurrent writes.

## Built-in Mongoose adapter (MongoDB)

If you already use MongoDB, a ready adapter is included:

```bash
npm install @kenzings/nestjs-permission @nestjs/mongoose mongoose
npx @kenzings/nestjs-permission init --database mongoose   # optional: generates a wrapper module
```

```ts
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MongooseModule } from "@nestjs/mongoose";
import { MongoosePermissionModule } from "@kenzings/nestjs-permission/mongoose";
import { PermissionsGuard } from "@kenzings/nestjs-permission";

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI!),
    MongoosePermissionModule.forRoot(),
  ],
  providers: [
    { provide: APP_GUARD, useClass: YourAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
```

Notes:

- It uses five indexed collections mirroring the data model above; indexes are created on connection.
- Replace-style methods (`syncPermissions`, `syncRoles`, `syncDirectPermissions`) run in a transaction, which requires a **replica set** (a single-node replica set is fine) or MongoDB Atlas — not a standalone server.
- Use a named connection with `MongoosePermissionModule.forRoot({ connectionName: 'tenant-db' })`; pass core options through `permissionOptions`, e.g. `MongoosePermissionModule.forRoot({ permissionOptions: { wildcardPermissions: false } })`.
- Schemas include optional `description` and `metadata` fields. [Multi-tenancy](#multi-tenancy) is supported out of the box: user assignments store `tenantId`, and the unique indexes already include it.

## Options

All entry points accept `NestPermissionModuleOptions`:

| Option                | Default     | Meaning                                                              |
| --------------------- | ----------- | --------------------------------------------------------------------- |
| `userProperty`        | `'user'`    | Request property holding the authenticated user.                       |
| `guardName`           | `'default'` | Namespace for all roles/permissions (e.g. separate `admin` vs `api`).  |
| `wildcardPermissions` | `true`      | Enables `products.*` and `*` matching.                                 |

For the Mongoose module, pass them via `permissionOptions`.

## Custom evaluator

To replace the allow/deny logic entirely (for example, evaluate against claims already on the JWT instead of the database), implement `PermissionEvaluator` and use `forRootWithEvaluator`:

```ts
import { Injectable } from "@nestjs/common";
import {
  PermissionEvaluator,
  PermissionUser,
  RequiredPermissions,
} from "@kenzings/nestjs-permission";

@Injectable()
export class JwtClaimsEvaluator implements PermissionEvaluator {
  hasPermissions(user: PermissionUser | undefined, required: RequiredPermissions): boolean {
    const granted = new Set(user?.permissions ?? []);
    return required.mode === "all"
      ? required.permissions.every((p) => granted.has(p))
      : required.permissions.some((p) => granted.has(p));
  }
}
```

## Support and issues

Before reporting an issue, upgrade to the latest version and create a minimal reproduction. Include:

- Package, NestJS, Node.js, and database/ORM versions.
- The adapter in use (built-in or custom) and relevant configuration.
- Expected and actual behavior, error stack, and reproduction steps.

Security vulnerabilities must not be reported in public issues; contact the maintainer privately.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run build` and `npm test` before opening a pull request. See [CHANGELOG.md](CHANGELOG.md) for release history and known limitations.
