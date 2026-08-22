import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('package exports', () => {
  it('loads the root and mongoose entry points from Node ESM', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const build = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    expect({ status: build.status, stderr: build.stderr }).toEqual({ status: 0, stderr: '' });

    const script = `
      const rootModule = await import('@kenzings/nestjs-permission');
      const mongooseModule = await import('@kenzings/nestjs-permission/mongoose');
      const root = rootModule.default ?? rootModule;
      const mongoose = mongooseModule.default ?? mongooseModule;
      if (typeof root.PermissionService !== 'function') throw new Error('Missing PermissionService');
      if (typeof mongoose.MongoosePermissionModule !== 'function') throw new Error('Missing MongoosePermissionModule');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  });
});
