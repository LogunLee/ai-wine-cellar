import { lazy, Suspense, ComponentType } from 'react'
import { Spin } from 'antd'

const LazyPage = (importFn: () => Promise<{ default: ComponentType }>) => {
  const Component = lazy(importFn)
  return () => (
    <Suspense fallback={<Spin size="large" style={{ display: 'block', margin: '120px auto' }} />}>
      <Component />
    </Suspense>
  )
}

export default LazyPage
