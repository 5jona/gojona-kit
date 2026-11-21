import { existsSync, realpathSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function findPackagesRoot() {
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    path.resolve(process.cwd(), '../../../../pochita-webui-kit/packages'),
    path.resolve(process.cwd(), '../pochita-webui-kit/packages'),
  ];
  for (const c of candidates) {
    if (existsSync(path.resolve(c, 'bridge/src/index.ts'))) {
      return c;
    }
  }
  return candidates[0];
}

const packagesRoot = findPackagesRoot();

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@pochita/')) {
      const pkg = specifier.replace('@pochita/', '');
      const folder = pkg === 'sideveil-sdk' ? 'sdk' : pkg;
      const candidate = path.resolve(packagesRoot, folder, 'src/index.ts');
      if (existsSync(candidate)) {
        return {
          url: pathToFileURL(realpathSync(candidate)).href,
          shortCircuit: true,
        };
      }
    }

    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidate = path.resolve(parentDir, `${specifier}.ts`);
      if (existsSync(candidate)) {
        return {
          url: pathToFileURL(realpathSync(candidate)).href,
          shortCircuit: true,
        };
      }
    }
    return nextResolve(specifier, context);
  },
});
