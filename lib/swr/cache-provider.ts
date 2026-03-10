// * Bounded LRU cache provider for SWR
// * Prevents unbounded memory growth during long sessions across many sites

const MAX_CACHE_ENTRIES = 200

export function boundedCacheProvider() {
  const map = new Map()
  const accessOrder: string[] = []

  const touch = (key: string) => {
    const idx = accessOrder.indexOf(key)
    if (idx > -1) accessOrder.splice(idx, 1)
    accessOrder.push(key)
  }

  const evict = () => {
    while (map.size > MAX_CACHE_ENTRIES && accessOrder.length > 0) {
      const oldest = accessOrder.shift()!
      map.delete(oldest)
    }
  }

  return {
    get(key: string) {
      if (map.has(key)) touch(key)
      return map.get(key)
    },
    set(key: string, value: any) {
      map.set(key, value)
      touch(key)
      evict()
    },
    delete(key: string) {
      map.delete(key)
      const idx = accessOrder.indexOf(key)
      if (idx > -1) accessOrder.splice(idx, 1)
    },
    keys() {
      return map.keys()
    },
  }
}
