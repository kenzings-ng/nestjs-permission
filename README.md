# @kenzings/nestjs-permission

**Permission-based authorization for NestJS with roles, direct permissions, wildcards, guards, decorators, and database-agnostic persistence.**

Inspired by [`spatie/laravel-permission`](https://spatie.be/docs/laravel-permission), this package brings a similar permission model to NestJS while keeping storage and authorization logic replaceable.

> **Status: 0.x beta** — the public API may change before 1.0.

## Why @kenzings/nestjs-permission?

NestJS provides the building blocks for authorization, but applications often need a simple way to express fine-grained permissions such as:

```ts
@RequirePermissions("products.create")
```

This package focuses on keeping that authorization layer small and decoupled:

* **Permission-based authorization** with NestJS guards and decorators
* **Roles and direct user permissions**
* **Wildcard permissions** such as `products.*` and `*`
* **Database-agnostic persistence** through `PermissionRepository`
* **Built-in in-memory adapter** for tests and prototypes
* **Built-in Mongoose adapter** for MongoDB
* **Custom evaluators** when database-backed permission checks are not what you need
* **Multi-tenancy** for user-specific role and permission assignments
* **Guard namespaces** for separate permission sets such as `admin` and `api`
* **TypeScript-first API**
* No dependency on a specific database or ORM in the core package

---

## 30-second example

Install the package:

```bash
npm install @kenzings/nestjs-permission
```

Register the permission module and guard:

```ts
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
  NestPermissionModule,
  PermissionsGuard,
} from "@kenzings/nestjs-permission";

@Module({
  imports: [NestPermissionModule.forRoot()],
  providers: [
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
```

Protect a route:

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

`@RequirePermissions()` requires **all** listed permissions.

`@RequireAnyPermission()` requires **at least one**.

Both support wildcard permissions.

---

## How it works

```text
@RequirePermissions("products.create")
              │
              ▼
      PermissionsGuard
              │
              │ reads request.user
              ▼
    PermissionEvaluator
              │
              │ allow / deny
              ▼
      PermissionService
              │
              │ roles, permissions,
              │ wildcards, tenancy
              ▼
    PermissionRepository
              │
              ▼
       Your storage
```

The core package does **not** talk directly to a database.

All persistence goes through the `PermissionRepository` contract, so you can use:

* MySQL
* MariaDB
* PostgreSQL
* SQLite
* MongoDB
* DynamoDB
* Redis
* an external IAM service
* or any other storage system

without changing your controllers, decorators, guards, or permission service.

---

## Choose your integration

| Goal                                  | Entry point                                                   |
| ------------------------------------- | ------------------------------------------------------------- |
| Quick demo, tests, or prototype       | `NestPermissionModule.forRoot()`                              |
| MongoDB                               | `MongoosePermissionModule.forRoot()`                          |
| Custom SQL/NoSQL database             | `NestPermissionModule.forRootWithRepository(...)`             |
| Custom authorization logic            | `NestPermissionModule.forRootWithEvaluator(...)`              |
| Custom database + authorization logic | `NestPermissionModule.forRootWithRepositoryAndEvaluator(...)` |

The built-in in-memory adapter is intended for tests, prototypes, and demos.

**Do not use in-memory storage for production data.**

---

# Installation

## Core package

```bash
npm install @kenzings/nestjs-permission
```

## Mongoose / MongoDB

If you use the built-in MongoDB adapter:

```bash
npm install @kenzings/nestjs-permission @nestjs/mongoose mongoose
```

---

# Quick start

## 1. Configure the module

The simplest setup uses the built-in in-memory repository:

```ts
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
  NestPermissionModule,
  PermissionsGuard,
} from "@kenzings/nestjs-permission";

@Module({
  imports: [
    NestPermissionModule.forRoot(),
  ],
  providers: [
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
```

This setup is useful for:

* local development
* examples
* unit tests
* prototypes

For production, use a persistent repository such as the built-in Mongoose adapter or your own `PermissionRepository`.

---

# Authentication and `request.user`

`PermissionsGuard` reads the authenticated user from `request.user`.

Your authentication guard must therefore:

1. run before `PermissionsGuard`
2. authenticate the request
3. populate `request.user`
4. provide an `id` on that user

For example:

```ts
request.user = {
  id: "user-1",
};
```

Then configure your global guards in the appropriate order:

```ts
providers: [
  { provide: APP_GUARD, useClass: YourAuthGuard },
  { provide: APP_GUARD, useClass: PermissionsGuard },
],
```

The authentication guard establishes the identity first. The permission guard then evaluates authorization.

### Custom user property

If your application stores the authenticated user somewhere other than `request.user`:

```ts
NestPermissionModule.forRoot({
  userProperty: "currentUser",
});
```

---

## Routes without permission metadata

Routes without a permission decorator are allowed through.

This is intentional and follows the opt-in authorization style commonly used with NestJS guards.

```ts
@Get()
findAll() {
  // allowed if no permission metadata is defined
}
```

**Important:** sensitive routes must be explicitly decorated.

For example:

```ts
@Post()
@RequirePermissions("products.create")
create() {
  // ...
}
```

---

# Protecting routes

## Require all permissions

```ts
@Post()
@RequirePermissions(
  "products.create",
  "products.publish",
)
create() {
  return { ok: true };
}
```

The user must have **every** required permission.

## Require any permission

```ts
@Get()
@RequireAnyPermission(
  "products.read",
  "products.manage",
)
findAll() {
  return [];
}
```

The user must have **at least one** of the required permissions.

---

# Managing permissions

Inject `PermissionService` wherever you need to create, assign, revoke, synchronize, or check permissions.

```ts
import { Injectable } from "@nestjs/common";
import { PermissionService } from "@kenzings/nestjs-permission";

@Injectable()
export class UserSetupService {
  constructor(
    private readonly permissions: PermissionService,
  ) {}
}
```

Permissions and roles must exist before they can be assigned.

Assigning an unknown permission or role throws a `NotFoundException`.

---

# Direct permissions

Grant a permission directly to a user:

```ts
await this.permissions.createPermission("products.delete");

await this.permissions.givePermissionTo(
  "user-1",
  "products.delete",
);

await this.permissions.hasPermissionTo(
  "user-1",
  "products.delete",
);
// true

await this.permissions.revokePermissionTo(
  "user-1",
  "products.delete",
);
```

Direct permissions are useful for individual exceptions.

For most applications, roles are a better way to manage normal access patterns.

---

# Roles

Create a role and assign permissions to it:

```ts
await this.permissions.createPermission("products.create");
await this.permissions.createRole("merchant");

await this.permissions.givePermissionToRole(
  "merchant",
  "products.create",
);

await this.permissions.assignRole(
  "user-1",
  "merchant",
);
```

The user's effective permissions include:

```text
direct user permissions
        +
permissions inherited from roles
```

Therefore:

```ts
await this.permissions.hasPermissionTo(
  "user-1",
  "products.create",
);
// true
```

---

# Syncing assignments

`sync*` methods replace the complete assignment set.

`give`, `assign`, `revoke`, and `remove` change individual assignments.

```ts
await this.permissions.syncRoles(
  "user-1",
  ["merchant"],
);

await this.permissions.syncPermissions(
  "merchant",
  ["products.create"],
);

await this.permissions.syncDirectPermissions(
  "user-1",
  [],
);
```

For example:

```ts
syncRoles("user-1", ["merchant"])
```

means that the user should have exactly the specified roles after the operation.

---

# Checking permissions and roles

Permission checks can be performed outside guarded controllers:

```ts
await this.permissions.hasPermissionTo(
  "user-1",
  "products.create",
);

await this.permissions.hasAnyPermission(
  "user-1",
  "products.create",
  "products.delete",
);

await this.permissions.hasAllPermissions(
  "user-1",
  "products.create",
  "products.delete",
);
```

Role checks are also available:

```ts
await this.permissions.hasRole(
  "user-1",
  "merchant",
);

await this.permissions.hasAnyRole(
  "user-1",
  "merchant",
  "admin",
);

await this.permissions.hasAllRoles(
  "user-1",
  "merchant",
  "admin",
);
```

Permission checks honor wildcard matching.

Role checks use exact role names.

---

# API reference

| Category          | Methods                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Define            | `createPermission`, `deletePermission`, `createRole`, `deleteRole`                          |
| Role → permission | `givePermissionToRole`, `revokePermissionFromRole`, `syncPermissions`, `getRolePermissions` |
| User → role       | `assignRole`, `removeRole`, `syncRoles`, `getRoles`                                         |
| User → permission | `givePermissionTo`, `revokePermissionTo`, `syncDirectPermissions`, `getAllPermissions`      |
| Permission checks | `hasPermissionTo`, `hasAnyPermission`, `hasAllPermissions`                                  |
| Role checks       | `hasRole`, `hasAnyRole`, `hasAllRoles`                                                      |
| Multi-tenancy     | `forTenant`                                                                                 |

---

# Wildcard permissions

Wildcard permissions are enabled by default.

A permission ending in `.*` matches permissions under that prefix.

```ts
await this.permissions.createPermission(
  "products.*",
);

await this.permissions.givePermissionTo(
  "user-1",
  "products.*",
);

await this.permissions.hasPermissionTo(
  "user-1",
  "products.create",
);
// true

await this.permissions.hasPermissionTo(
  "user-1",
  "orders.create",
);
// false
```

A bare `*` matches every permission:

```ts
await this.permissions.createPermission("*");

await this.permissions.givePermissionTo(
  "user-1",
  "*",
);
```

This effectively gives the user unrestricted permission access.

A common use is a `super-admin` role:

```text
super-admin
    └── *
```

### Disable wildcards

If you only want exact permission matching:

```ts
NestPermissionModule.forRoot({
  wildcardPermissions: false,
});
```

---

# Roles vs permissions

The recommended model is:

```text
Role
 │
 ├── Permission
 ├── Permission
 └── Permission
        │
        ▼
      User
```

### Check permissions in application code

Prefer:

```ts
@RequirePermissions("articles.edit")
```

over:

```ts
@RequireRole("editor")
```

Permissions describe what the application needs.

Roles describe how humans group those permissions.

This keeps application code stable when role definitions change.

### Assign permissions to roles

For normal access management:

```text
editor
 ├── articles.read
 ├── articles.create
 └── articles.edit
```

Then assign the role:

```ts
await this.permissions.assignRole(
  "user-1",
  "editor",
);
```

### Use direct permissions sparingly

Direct user permissions are useful for exceptions:

```text
user-1
 └── reports.export
```

but should generally not replace role-based access management.

### Name permissions after actions

Prefer:

```text
articles.read
articles.create
articles.edit
articles.delete

orders.read
orders.refund
orders.cancel
```

The dot-separated naming convention also works naturally with wildcards:

```text
articles.*
orders.*
```

---

# Multiple guards

Every role, permission, and assignment is namespaced by a `guardName`.

The default is:

```text
default
```

This allows separate permission sets for different application areas.

For example:

```text
admin
 ├── users.manage
 └── reports.view

api
 ├── orders.read
 └── orders.create
```

Configure a guard namespace:

```ts
NestPermissionModule.forRoot({
  guardName: "admin",
});
```

Or with the Mongoose adapter:

```ts
MongoosePermissionModule.forRoot({
  permissionOptions: {
    guardName: "admin",
  },
});
```

Data under one `guardName` is invisible to another.

Custom adapters **must scope every relevant query by `guardName`**.

The built-in adapters already do this.

---

# Multi-tenancy

For applications where users have different permissions depending on their workspace, organization, team, or tenant, use `forTenant()`.

Permission and role definitions are shared.

User assignments are tenant-specific.

```ts
await this.permissions.createRole("editor");

const workspace =
  this.permissions.forTenant("workspace-42");

await workspace.assignRole(
  "user-1",
  "editor",
);

await workspace.hasRole(
  "user-1",
  "editor",
);
// true
```

The global scope remains separate:

```ts
await this.permissions.hasRole(
  "user-1",
  "editor",
);
// false
```

Another tenant is also isolated:

```ts
await this.permissions
  .forTenant("workspace-7")
  .hasRole("user-1", "editor");
// false
```

## Tenant-aware route guards

Your authentication layer can expose the tenant through `request.user`:

```ts
request.user = {
  id: payload.sub,
  tenantId: payload.workspaceId,
};
```

When `tenantId` is present, `PermissionsGuard` evaluates the user's assignments within that tenant.

When it is absent, it evaluates the global scope.

Existing non-tenant applications therefore continue to work without changes.

---

# Database-agnostic persistence

The core package intentionally does not depend on a specific database.

All storage goes through:

```ts
PermissionRepository
```

Register your own implementation:

```ts
@Module({
  imports: [
    NestPermissionModule.forRootWithRepository(
      MyPermissionRepository,
    ),
  ],
})
export class AppModule {}
```

You can implement the repository using:

* PostgreSQL
* MySQL
* MariaDB
* SQLite
* TypeORM
* Prisma
* MongoDB
* DynamoDB
* Redis
* another external service

The authorization layer does not need to know which one you chose.

---

# Creating your own adapter

The CLI can generate a typed repository skeleton:

```bash
npx @kenzings/nestjs-permission init --database prisma
```

or:

```bash
npx @kenzings/nestjs-permission init --database typeorm
```

The generated skeleton contains methods that throw until implemented.

## Data model

The adapter needs to persist five concepts:

| Concept            | Meaning                                | Uniqueness                                |
| ------------------ | -------------------------------------- | ----------------------------------------- |
| `permissions`      | Named permissions                      | `(name, guard_name)`                      |
| `roles`            | Named roles                            | `(name, guard_name)`                      |
| `role_permissions` | Permissions assigned to roles          | `(role_id, permission_id, guard_name)`    |
| `user_roles`       | Roles assigned to users                | `(subject_id, role_id, guard_name)`       |
| `user_permissions` | Permissions assigned directly to users | `(subject_id, permission_id, guard_name)` |

Every read and write must be scoped by `guardName`.

Never allow data belonging to one guard namespace to leak into another.

Store `subjectId` as a stable string representation of your application's user ID.

## SQL databases

The model maps naturally to five tables.

Use:

* foreign keys for relationships
* unique constraints for assignments
* appropriate indexes for lookup queries
* cascading cleanup where appropriate

Deleting a role or permission must also clean up its related assignment rows.

## NoSQL databases

The physical representation is up to the adapter.

For example, you can use:

* separate collections
* embedded arrays
* another document-oriented model

The adapter only needs to expose the expected repository behavior and enforce the required uniqueness/isolation rules.

The built-in Mongoose adapter provides a reference implementation.

---

# PermissionRepository contract

The core repository methods are:

```ts
createPermission
deletePermission
permissionExists

createRole
deleteRole
roleExists

setRolePermissions
getRolePermissions

setUserRoles
getUserRoles

setUserPermissions
getUserPermissions
```

Optional methods can provide safer atomic single-row operations:

```ts
addRolePermissions
removeRolePermissions

addUserRoles
removeUserRoles

addUserPermissions
removeUserPermissions
```

When these methods are implemented, `PermissionService` uses them instead of relying on read-modify-write behavior for the corresponding operations.

## Adapter requirements

For production adapters:

* Scope reads and writes by `guardName`.
* Use transactions or equivalent atomic operations for replace-style `set*` methods.
* Clean up related assignments when deleting roles or permissions.
* Keep tenant assignments isolated by `tenantId`.
* Use appropriate indexes and unique constraints.
* Consider concurrency when implementing `add*` and `remove*`.
* Add integration tests against the exact database version used in production.

For multi-tenancy, user-assignment methods receive an optional:

```ts
tenantId?: string
```

When set, operate only on that tenant's assignments.

When undefined, operate only on tenant-less assignments.

For SQL databases, include `tenant_id` in the relevant uniqueness constraints if multi-tenancy is enabled.

Caching and locking are intentionally left to the adapter/application layer.

---

# MongoDB / Mongoose adapter

A production-oriented Mongoose adapter is included.

Install:

```bash
npm install @kenzings/nestjs-permission @nestjs/mongoose mongoose
```

Optionally generate a wrapper module:

```bash
npx @kenzings/nestjs-permission init --database mongoose
```

Example:

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

### Mongoose adapter notes

The adapter:

* uses five indexed collections
* creates indexes when the connection is established
* supports `guardName`
* supports multi-tenancy
* supports optional `description` and `metadata` fields

Replace-style operations such as:

```ts
syncPermissions()
syncRoles()
syncDirectPermissions()
```

run inside MongoDB transactions.

Therefore, transaction-based operations require a MongoDB replica set, including a single-node replica set, or MongoDB Atlas.

### Named connections

Use a named connection when required:

```ts
MongoosePermissionModule.forRoot({
  connectionName: "tenant-db",
});
```

Pass core options through `permissionOptions`:

```ts
MongoosePermissionModule.forRoot({
  permissionOptions: {
    wildcardPermissions: false,
  },
});
```

---

# Custom evaluator

The default evaluator resolves permissions through the configured permission service.

You can replace the authorization decision logic entirely.

This is useful when permissions are already available in:

* JWT claims
* an external IAM system
* request context
* another authorization service
* application-specific policy logic

Implement `PermissionEvaluator`:

```ts
import { Injectable } from "@nestjs/common";
import {
  PermissionEvaluator,
  PermissionUser,
  RequiredPermissions,
} from "@kenzings/nestjs-permission";

@Injectable()
export class JwtClaimsEvaluator
  implements PermissionEvaluator
{
  hasPermissions(
    user: PermissionUser | undefined,
    required: RequiredPermissions,
  ): boolean {
    const granted = new Set(
      user?.permissions ?? [],
    );

    return required.mode === "all"
      ? required.permissions.every((permission) =>
          granted.has(permission),
        )
      : required.permissions.some((permission) =>
          granted.has(permission),
        );
  }
}
```

Register it:

```ts
NestPermissionModule.forRootWithEvaluator(
  JwtClaimsEvaluator,
);
```

This lets you keep the same route decorators and guards while replacing the underlying authorization decision.

---

# Options

All module entry points accept `NestPermissionModuleOptions`.

| Option                | Default     | Description                                        |
| --------------------- | ----------- | -------------------------------------------------- |
| `userProperty`        | `"user"`    | Request property containing the authenticated user |
| `guardName`           | `"default"` | Permission namespace                               |
| `wildcardPermissions` | `true`      | Enables `products.*` and `*` matching              |

For the Mongoose module, pass these options through `permissionOptions`.

Example:

```ts
NestPermissionModule.forRoot({
  userProperty: "currentUser",
  guardName: "admin",
  wildcardPermissions: true,
});
```

---

# Security considerations

This package sits directly in the authorization layer of an application. Treat permission configuration and adapter implementations as security-sensitive code.

## Authentication comes first

`PermissionsGuard` is an authorization guard.

It does not replace authentication.

Your authentication guard must establish the identity before permission evaluation:

```text
Authentication
      ↓
request.user
      ↓
PermissionsGuard
      ↓
allow / deny
```

## Protect sensitive routes explicitly

Routes without permission metadata are intentionally allowed through.

Make sure sensitive endpoints have the appropriate decorator.

## Treat `*` as highly privileged

Granting:

```text
*
```

effectively bypasses all permission checks.

Restrict assignment of wildcard permissions to trusted administrative workflows.

## Scope every adapter query

Custom repositories must correctly scope data by:

```text
guardName
tenantId
```

where applicable.

A repository implementation that ignores either namespace can cause authorization data to cross boundaries.

## Test your production adapter

Before deploying a custom adapter, test at minimum:

* permission assignment
* permission revocation
* role assignment
* role removal
* deletion cleanup
* wildcard matching
* guard-name isolation
* tenant isolation
* concurrent updates

---

# Compatibility

This package is currently in **0.x beta**.

The public API may change before `1.0.0`.

For production adoption, pin the package version and review the changelog before upgrading.

Check the package metadata for the currently supported:

* Node.js versions
* NestJS versions
* TypeScript versions
* Mongoose versions

---

# When should I use this?

Use `@kenzings/nestjs-permission` when you want:

* route-level permission decorators
* role-based access control
* fine-grained permissions
* direct user permissions
* wildcard permissions
* multi-tenant permissions
* database-independent authorization
* a NestJS-native guard/decorator API

A typical application can model access like:

```text
admin
 ├── users.*
 ├── products.*
 └── reports.*

merchant
 ├── products.read
 ├── products.create
 └── products.update

support
 ├── orders.read
 └── orders.refund
```

Then application code checks the permission:

```ts
@RequirePermissions("orders.refund")
refundOrder() {
  // ...
}
```

rather than coupling the route to a particular role.

---

# When should I consider another authorization library?

This package intentionally focuses on permission and role-based authorization.

Consider a more advanced policy engine when your authorization rules require complex conditions such as:

```text
user can edit article
IF
  user owns article
  OR
  user has editor role
  AND
  article belongs to user's organization
```

If your application needs sophisticated attribute-based or policy-based authorization, evaluate solutions such as CASL or a dedicated policy engine alongside this package.

The goal of `@kenzings/nestjs-permission` is to remain a focused permission layer rather than become a general-purpose authorization framework.

---

# Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Before opening a pull request, make sure the project builds and tests pass.

See:

* [`CONTRIBUTING.md`](CONTRIBUTING.md)
* [`CHANGELOG.md`](CHANGELOG.md)

---

# Support and issues

Before reporting an issue:

1. Upgrade to the latest version.
2. Check the documentation.
3. Create a minimal reproduction.
4. Include the relevant package and environment versions.

Please include:

* `@kenzings/nestjs-permission` version
* NestJS version
* Node.js version
* database/ORM version
* adapter being used
* relevant configuration
* expected behavior
* actual behavior
* error stack
* reproduction steps

Do not include secrets, credentials, tokens, or private application data in issue reports.

---

# Security vulnerabilities

**Do not report security vulnerabilities through public GitHub issues.**

Use the repository's private security reporting mechanism or contact the maintainer privately.

When reporting a vulnerability, include enough information to reproduce and validate the issue without exposing real credentials or sensitive production data.

---

# Contributing

Contributions are welcome.

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

For changes to authorization behavior, include tests covering both allowed and denied cases.

Before submitting:

```bash
npm run build
npm test
```

See [`CHANGELOG.md`](CHANGELOG.md) for release history and known limitations.

---

# License

MIT

---

## Related projects

* [NestJS](https://nestjs.com/)
* [spatie/laravel-permission](https://spatie.be/docs/laravel-permission)
* [CASL](https://casl.js.org/)

---

## Keywords

NestJS, NestJS permission, NestJS authorization, NestJS RBAC, NestJS ACL, permission, permissions, authorization, access control, role-based access control, RBAC, ACL, NestJS guard, NestJS decorators, multi-tenant authorization
