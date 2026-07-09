/**
 * Render-as-you-fetch data fetching for React Suspense.
 *
 * Throwing a promise during render triggers the nearest Suspense boundary.
 * Both waitResource and waitFetch follow the cache-then-suspend pattern:
 * on first call they initiate the fetch and store the promise; on re-entry
 * (after React catches the thrown promise) they throw the cached promise;
 * once resolved they return the cached result and clean up.
 */
interface LoaderState<T = unknown> {
  suspended: boolean
  error: Error | null
  result: T | null
  promise: Promise<unknown> | null
}

interface FetchLoaderState {
  suspended: boolean
  error: Error | null
  data: Record<string, unknown> | null
  promise: Promise<unknown> | null
}

const clientFetchMap = new Map<string, FetchLoaderState>()
const clientResourceMap = new Map<string, LoaderState>()

/**
 * Cache-then-suspend data fetcher keyed by resourceId (\`${path}:${id}\`).
 *
 * - Cache hit & resolved -> delete entry, return result.
 * - Cache hit & suspended -> throw cached promise (triggers Suspense).
 * - Cache miss & loader fn provided -> initiate fetch, store promise, re-enter.
 * - Cache miss & no loader fn -> throw a suspended promise or error.
 */
export function waitResource<T>(
  path: string,
  id: string,
  promise?: () => Promise<T>,
  resourceMap: Map<string, LoaderState> = clientResourceMap,
): T {
  const resourceId = `${path}:${id}`
  const loaderStatus = resourceMap.get(resourceId)
  if (loaderStatus) {
    if (loaderStatus.error) {
      throw loaderStatus.error
    }
    if (loaderStatus.suspended) {
      // Suspend: re-throw the stored promise to trigger React Suspense
      throw loaderStatus.promise
    }
    // Cache hit: return result, clean up entry for next call
    resourceMap.delete(resourceId)
    return loaderStatus.result as T
  }

  if (!promise) {
    // If the cache entry is missing on re-entry, re-throw the suspended
    // promise instead of a generic Error — this keeps Suspense working
    // correctly even if the resource map was mutated between suspend and re-entry
    const suspendedPromise = resourceMap.get(resourceId)?.promise
    throw suspendedPromise ?? new Error('Resource not found')
  }

  const loader: LoaderState<T> = {
    suspended: true,
    error: null,
    result: null,
    promise: null,
  }
  loader.promise = promise()
    .then((result) => {
      loader.result = result
    })
    .catch((loaderError: Error) => {
      loader.error = loaderError
    })
    .finally(() => {
      loader.suspended = false
    })

  resourceMap.set(resourceId, loader)

  // Re-enter to throw the suspended promise — triggers React Suspense boundary
  return waitResource<T>(path, id, undefined, resourceMap)
}

export function waitFetch(
  path: string,
  options: Record<string, unknown> = {},
  fetchMap: Map<string, FetchLoaderState> = clientFetchMap,
): Record<string, unknown> {
  const loaderStatus = fetchMap.get(path)
  if (loaderStatus) {
    const data = loaderStatus.data
    // Check for cached error state — throw immediately
    if (loaderStatus.error || data?.statusCode === 500) {
      if (data?.statusCode === 500) {
        throw new Error(data.message as string)
      }
      throw loaderStatus.error
    }
    // Suspend: re-throw the stored promise to trigger React Suspense
    if (loaderStatus.suspended) {
      throw loaderStatus.promise
    }
    // Cache hit: return data, clean up entry for next call
    fetchMap.delete(path)
    return loaderStatus.data as Record<string, unknown>
  }

  const loader: FetchLoaderState = {
    suspended: true,
    error: null,
    data: null,
    promise: null,
  }
  loader.promise = fetch(path, options as RequestInit)
    .then((response) => response.json())
    .then((loaderData: Record<string, unknown>) => {
      loader.data = loaderData
    })
    .catch((loaderError: Error) => {
      loader.error = loaderError
    })
    .finally(() => {
      loader.suspended = false
    })

  fetchMap.set(path, loader)

  return waitFetch(path, options, fetchMap)
}
