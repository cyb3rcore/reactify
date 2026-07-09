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
      throw loaderStatus.promise
    }
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

  // Re-enter to pick up the suspended state (triggers React Suspense)
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
    if (loaderStatus.error || data?.statusCode === 500) {
      if (data?.statusCode === 500) {
        throw new Error(data.message as string)
      }
      throw loaderStatus.error
    }
    if (loaderStatus.suspended) {
      throw loaderStatus.promise
    }
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
