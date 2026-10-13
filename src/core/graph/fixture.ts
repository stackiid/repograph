import type { FileEntry, Relationship, RelationshipType } from '../types'

/** Demo data only. Shown in the UI with a "Demo data" label and never mixed with analysis results. */
export const DEMO_PROJECT_NAME = 'demo-storefront'

const LANGUAGES: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript (JSX)', js: 'JavaScript', jsx: 'JavaScript (JSX)' }

function file(path: string, lineCount: number, sizeBytes: number): FileEntry {
  const baseName = path.slice(path.lastIndexOf('/') + 1)
  const extension = baseName.slice(baseName.lastIndexOf('.') + 1)
  const slash = path.lastIndexOf('/')
  return {
    id: path, path, baseName, extension,
    parentDir: slash < 0 ? '' : path.slice(0, slash),
    lineCount, sizeBytes, status: 'analyzed', language: LANGUAGES[extension], diagnostics: [],
  }
}

function local(source: string, line: number, specifier: string, target: string, type: RelationshipType = 'import'): Relationship {
  return { id: `${source}:${line}:${specifier}`, sourceId: source, targetId: target, type, line, specifier, resolution: 'resolved' }
}
function pkg(source: string, line: number, specifier: string): Relationship {
  return { id: `${source}:${line}:${specifier}`, sourceId: source, type: 'import', line, specifier, resolution: 'external' }
}
function missing(source: string, line: number, specifier: string): Relationship {
  return { id: `${source}:${line}:${specifier}`, sourceId: source, type: 'import', line, specifier, resolution: 'unresolved' }
}

export const DEMO_FILES: FileEntry[] = [
  file('src/main.tsx', 12, 380),
  file('src/App.tsx', 34, 1100),
  file('src/routes.tsx', 28, 900),
  file('src/types.ts', 30, 760),
  file('src/pages/Home.tsx', 61, 2100),
  file('src/pages/Cart.tsx', 74, 2600),
  file('src/pages/Checkout.tsx', 98, 3400),
  file('src/components/index.ts', 3, 90),
  file('src/components/Header.tsx', 42, 1300),
  file('src/components/ProductCard.tsx', 55, 1800),
  file('src/hooks/useCart.ts', 47, 1500),
  file('src/lib/api.ts', 66, 2200),
  file('src/lib/cartStore.ts', 52, 1700),
  file('src/lib/format.ts', 18, 520),
]

export const DEMO_RELATIONSHIPS: Relationship[] = [
  pkg('src/main.tsx', 1, 'react'),
  pkg('src/main.tsx', 2, 'react-dom/client'),
  local('src/main.tsx', 3, './App', 'src/App.tsx'),
  pkg('src/App.tsx', 1, 'react'),
  pkg('src/App.tsx', 2, 'react-router-dom'),
  local('src/App.tsx', 3, './routes', 'src/routes.tsx'),
  local('src/App.tsx', 4, './components', 'src/components/index.ts'),
  local('src/routes.tsx', 1, './pages/Home', 'src/pages/Home.tsx'),
  local('src/routes.tsx', 2, './pages/Cart', 'src/pages/Cart.tsx'),
  local('src/routes.tsx', 3, './pages/Checkout', 'src/pages/Checkout.tsx'),
  pkg('src/pages/Home.tsx', 1, 'react'),
  local('src/pages/Home.tsx', 2, '../components', 'src/components/index.ts'),
  local('src/pages/Home.tsx', 3, '../lib/api', 'src/lib/api.ts'),
  local('src/pages/Home.tsx', 4, '../types', 'src/types.ts'),
  local('src/pages/Cart.tsx', 1, '../hooks/useCart', 'src/hooks/useCart.ts'),
  local('src/pages/Cart.tsx', 2, '../components', 'src/components/index.ts'),
  local('src/pages/Cart.tsx', 3, '../lib/format', 'src/lib/format.ts'),
  pkg('src/pages/Checkout.tsx', 1, 'react'),
  local('src/pages/Checkout.tsx', 2, '../hooks/useCart', 'src/hooks/useCart.ts'),
  local('src/pages/Checkout.tsx', 3, '../lib/format', 'src/lib/format.ts'),
  local('src/pages/Checkout.tsx', 4, '../lib/api', 'src/lib/api.ts'),
  missing('src/pages/Checkout.tsx', 6, '@/lib/payments'),
  local('src/components/index.ts', 1, './Header', 'src/components/Header.tsx', 'reexport'),
  local('src/components/index.ts', 2, './ProductCard', 'src/components/ProductCard.tsx', 'reexport'),
  pkg('src/components/Header.tsx', 1, 'react'),
  local('src/components/Header.tsx', 2, '../hooks/useCart', 'src/hooks/useCart.ts'),
  local('src/components/ProductCard.tsx', 1, '../types', 'src/types.ts'),
  local('src/components/ProductCard.tsx', 2, '../lib/format', 'src/lib/format.ts'),
  pkg('src/hooks/useCart.ts', 1, 'react'),
  local('src/hooks/useCart.ts', 2, '../lib/cartStore', 'src/lib/cartStore.ts'),
  local('src/hooks/useCart.ts', 3, '../types', 'src/types.ts'),
  local('src/lib/cartStore.ts', 1, '../types', 'src/types.ts'),
  local('src/lib/cartStore.ts', 2, './api', 'src/lib/api.ts'),
  local('src/lib/api.ts', 1, '../types', 'src/types.ts'),
  local('src/lib/api.ts', 2, './cartStore', 'src/lib/cartStore.ts'),
]
