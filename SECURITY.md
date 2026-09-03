# Security Policy

## Supported Versions

This project is pre-1.0 and moves fast; only the latest published `0.x` release on npm
receives security fixes.

| Version   | Supported          |
| --------- | ------------------ |
| Latest 0.x | :white_check_mark: |
| Older 0.x  | :x:                |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for a security vulnerability.

Report it privately through GitHub's [Security Advisories](https://github.com/kenzings-ng/nestjs-permission/security/advisories/new)
("Report a vulnerability" button on the repository's Security tab). This opens a private
discussion visible only to the maintainers until a fix is ready.

Please include:

- A minimal reproduction (a failing test or small sample app is ideal).
- The affected version(s) and the `PermissionRepository` adapter in use (in-memory, Mongoose, custom).
- The potential impact (e.g. permission bypass, privilege escalation, data leakage across guards/tenants).

## Response

We aim to acknowledge new reports within a few days. Once a fix is confirmed, it will be
released as a new `0.x` version and credited in `CHANGELOG.md`, coordinated with the reporter
on public disclosure timing.
