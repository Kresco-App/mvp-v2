import api from '@/lib/axios'

type ApiRequestConfig = Record<string, unknown>

export async function getJson<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
  const { data } = config === undefined
    ? await api.get<T>(url)
    : await api.get<T>(url, config)
  return data
}

export async function postJson<T = unknown, Body = unknown>(
  url: string,
  body?: Body,
  config?: ApiRequestConfig,
): Promise<T> {
  const { data } = config === undefined
    ? body === undefined
      ? await api.post<T>(url)
      : await api.post<T>(url, body)
    : await api.post<T>(url, body, config)
  return data
}

export async function patchJson<T = unknown, Body = unknown>(
  url: string,
  body?: Body,
  config?: ApiRequestConfig,
): Promise<T> {
  const { data } = config === undefined
    ? await api.patch<T>(url, body)
    : await api.patch<T>(url, body, config)
  return data
}

export async function deleteJson<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
  const { data } = config === undefined
    ? await api.delete<T>(url)
    : await api.delete<T>(url, config)
  return data
}

export const apiJsonClient = {
  async get<T = unknown>(url: string, config?: ApiRequestConfig) {
    return { data: await getJson<T>(url, config) }
  },
  async post<T = unknown, Body = unknown>(url: string, body?: Body, config?: ApiRequestConfig) {
    return { data: await postJson<T, Body>(url, body, config) }
  },
  async patch<T = unknown, Body = unknown>(url: string, body?: Body, config?: ApiRequestConfig) {
    return { data: await patchJson<T, Body>(url, body, config) }
  },
  async delete<T = unknown>(url: string, config?: ApiRequestConfig) {
    return { data: await deleteJson<T>(url, config) }
  },
}
