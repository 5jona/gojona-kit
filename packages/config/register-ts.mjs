import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function findMonorepoPackagesRoot() {
  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    ...(process.env.POCHITA_KIT_ROOT
      ? [path.resolve(process.env.POCHITA_KIT_ROOT, 'packages')]
      : []),
  ];
  for (const candidate of candidates) {
    if (
      existsSync(path.resolve(candidate, 'bridge/src/index.ts')) &&
      existsSync(path.resolve(candidate, 'sdk/src/index.ts')) &&
      existsSync(path.resolve(candidate, 'ui/src/index.ts'))
    ) {
      return candidate;
    }
  }
  return null;
}

const monorepoPackagesRoot = findMonorepoPackagesRoot();

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (monorepoPackagesRoot) {
      if (specifier === '@gojona/ui/theme-tokens') {
        const candidate = path.resolve(monorepoPackagesRoot, 'ui/src/theme/tokens.ts');
        if (existsSync(candidate)) {
          return {
            url: pathToFileURL(realpathSync(candidate)).href,
            shortCircuit: true,
          };
        }
      }

      if (specifier === '@gojona/config/themes') {
        const candidate = path.resolve(monorepoPackagesRoot, 'config/themes.mjs');
        if (existsSync(candidate)) {
          return {
            url: pathToFileURL(realpathSync(candidate)).href,
            shortCircuit: true,
          };
        }
      }

      if (specifier === '@gojona/bridge/core') {
        const candidate = path.resolve(monorepoPackagesRoot, 'bridge/src/core.ts');
        if (existsSync(candidate)) {
          return {
            url: pathToFileURL(realpathSync(candidate)).href,
            shortCircuit: true,
          };
        }
      }

      if (specifier === '@gojona/sideveil-sdk/core') {
        const candidate = path.resolve(monorepoPackagesRoot, 'sdk/src/core.ts');
        if (existsSync(candidate)) {
          return {
            url: pathToFileURL(realpathSync(candidate)).href,
            shortCircuit: true,
          };
        }
      }

      if (specifier.startsWith('@gojona/') && !specifier.slice('@gojona/'.length).includes('/')) {
        const pkg = specifier.slice('@gojona/'.length);
        const folder = pkg === 'sideveil-sdk' ? 'sdk' : pkg;
        const candidate = path.resolve(monorepoPackagesRoot, folder, 'src/index.ts');
        if (existsSync(candidate)) {
          return {
            url: pathToFileURL(realpathSync(candidate)).href,
            shortCircuit: true,
          };
        }
      }
    }

    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      for (const ext of ['.ts', '.tsx']) {
        const candidate = path.resolve(parentDir, `${specifier}${ext}`);
        if (existsSync(candidate)) {
          return {
            url: pathToFileURL(realpathSync(candidate)).href,
            shortCircuit: true,
          };
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) {
      return {
        format: 'module-typescript',
        source: readFileSync(fileURLToPath(url), 'utf8'),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
