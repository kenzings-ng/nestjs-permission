# Contributing

## Development

Use Node.js supported by the target NestJS version. Install dependencies, then run:

```bash
npm run build
npm test
```

## Pull Requests

- Keep changes focused and preserve backward compatibility during the 0.x series where practical.
- Add unit tests for core behavior and integration tests for a database adapter.
- Update `README.md` and `CHANGELOG.md` for user-visible changes.
- Do not add a database adapter without documenting supported drivers, migrations/schema, transaction behavior, and test coverage.

## Reporting Bugs

Use the bug report template and include a minimal reproduction, version information, expected behavior, actual behavior, and sanitized configuration. Do not publish credentials, tokens, customer data, or unpatched security vulnerabilities.
