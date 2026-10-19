/**
 * Plain source files used as test inputs. They are zipped and run through the real analysis pipeline,
 * the same path a user's upload takes. This file is not part of the app bundle.
 */

/** A small project with an unresolved import, a package import, an unconnected file, and a file that fails to parse. */
export const SAMPLE_FILES: Record<string, string> = {
  'app-main/src/main.tsx': "import React from 'react'\nimport { App } from './App'\nimport { gone } from './missing'\n",
  'app-main/src/App.tsx': "import { helper } from './util'\nimport type { T } from './types'\nexport const App = () => null\n",
  'app-main/src/util.ts': "import { App } from './App'\nexport const helper = 1\n",
  'app-main/src/types.ts': 'export type T = 1\n',
  'app-main/src/lonely.ts': 'export const alone = true\n',
  'app-main/src/broken.ts': 'const = ;\n',
  'app-main/README.md': '# readme',
}

/**
 * A 14-file storefront with a barrel file (re-exports), a two-file import cycle, a path alias that cannot
 * be resolved, package imports, and shared leaf modules. Entry: main.tsx. Wrapper folder: storefront-main/.
 */
export const STOREFRONT_FILES: Record<string, string> = {
  'storefront-main/src/main.tsx': [
    "import React from 'react'",
    "import ReactDOM from 'react-dom/client'",
    "import { App } from './App'",
    'ReactDOM.createRoot(document.body).render(<App />)',
  ].join('\n') + '\n',
  'storefront-main/src/App.tsx': [
    "import React from 'react'",
    "import { BrowserRouter } from 'react-router-dom'",
    "import { routes } from './routes'",
    "import { Header } from './components'",
    'export const App = () => <BrowserRouter><Header />{routes}</BrowserRouter>',
  ].join('\n') + '\n',
  'storefront-main/src/routes.tsx': [
    "import { Home } from './pages/Home'",
    "import { Cart } from './pages/Cart'",
    "import { Checkout } from './pages/Checkout'",
    'export const routes = [Home, Cart, Checkout]',
  ].join('\n') + '\n',
  'storefront-main/src/types.ts': 'export interface Product { id: number; price: number }\n',
  'storefront-main/src/pages/Home.tsx': [
    "import React from 'react'",
    "import { ProductCard } from '../components'",
    "import { fetchProducts } from '../lib/api'",
    "import type { Product } from '../types'",
    'export const Home = (p: { items: Product[] }) => <ProductCard item={p.items[0]} />',
  ].join('\n') + '\n',
  'storefront-main/src/pages/Cart.tsx': [
    "import { useCart } from '../hooks/useCart'",
    "import { ProductCard } from '../components'",
    "import { money } from '../lib/format'",
    'export const Cart = () => money(useCart().total)',
  ].join('\n') + '\n',
  'storefront-main/src/pages/Checkout.tsx': [
    "import React from 'react'",
    "import { useCart } from '../hooks/useCart'",
    "import { money } from '../lib/format'",
    "import { fetchProducts } from '../lib/api'",
    '',
    "import { pay } from '@/lib/payments'",
    'export const Checkout = () => pay(money(useCart().total))',
  ].join('\n') + '\n',
  'storefront-main/src/components/index.ts': "export { Header } from './Header'\nexport { ProductCard } from './ProductCard'\n",
  'storefront-main/src/components/Header.tsx': [
    "import React from 'react'",
    "import { useCart } from '../hooks/useCart'",
    'export const Header = () => <header>{useCart().total}</header>',
  ].join('\n') + '\n',
  'storefront-main/src/components/ProductCard.tsx': [
    "import type { Product } from '../types'",
    "import { money } from '../lib/format'",
    'export const ProductCard = (p: { item: Product }) => <div>{money(p.item.price)}</div>',
  ].join('\n') + '\n',
  'storefront-main/src/hooks/useCart.ts': [
    "import { useState } from 'react'",
    "import { getCart } from '../lib/cartStore'",
    "import type { Product } from '../types'",
    'export const useCart = () => ({ total: getCart().length as number, items: [] as Product[] })',
  ].join('\n') + '\n',
  'storefront-main/src/lib/cartStore.ts': [
    "import type { Product } from '../types'",
    "import { syncCart } from './api'",
    'export const getCart = (): Product[] => { syncCart(); return [] }',
  ].join('\n') + '\n',
  'storefront-main/src/lib/api.ts': [
    "import type { Product } from '../types'",
    "import { getCart } from './cartStore'",
    'export const fetchProducts = async (): Promise<Product[]> => []',
    'export const syncCart = () => getCart()',
  ].join('\n') + '\n',
  'storefront-main/src/lib/format.ts': 'export const money = (n: number) => `$${n.toFixed(2)}`\n',
}
