import wretch from 'wretch';
import AbortAddon from 'wretch/addons/abort';
import FormDataAddon from 'wretch/addons/formData';
import QueryAddon from 'wretch/addons/queryString';
import { WretchError } from 'wretch/resolver';

import {
  BaseRequest,
  CreateRawRequestOptions,
  CreateRequestOptions,
  HttpDeleteOptions,
  HttpDeleteRawOptions,
  HttpFormDataPostOptions,
  HttpGetOptions,
  HttpGetRawOptions,
  HttpHeadRawOptions,
  HttpJsonDeleteOptions,
  HttpPatchOptions,
  HttpPatchRawOptions,
  HttpPostOptions,
  HttpPostRawOptions,
  HttpPutOptions,
  HttpPutRawOptions,
  QueriedRequest,
  QueryRequestOptions,
  RawResponse,
} from './fetch.type';

function defaultHandleError(error: WretchError): void {
  // With errorType 'json', wretch puts the parsed body in `message`, which
  // prints as "[object Object]".
  if (error.status) {
    console.error(
      `HTTP ${error.status} ${error.response?.url ?? ''}`,
      error.json ?? error.text,
    );
    return;
  }
  console.error(error);
}

function createRequest<T>({
  url,
  wretchOptions = {},
  token,
  abortController,
  headers,
  errorType = 'json',
}: CreateRequestOptions): BaseRequest<T> {
  let base = (
    token
      ? wretch(url, wretchOptions).auth(`Bearer ${token}`)
      : wretch(url, wretchOptions)
  ).addon(AbortAddon());

  if (headers) {
    base = base.headers(headers);
  }

  const request = !abortController ? base : base.signal(abortController);

  return request.errorType(errorType).resolve((r) => {
    return r.json<T>().catch(() => {
      return r.res<T>(); // manage unexpected error in `.json()`
    });
  });
}

function queryRequest<T>({
  baseRequest,
  params,
}: QueryRequestOptions<T>): QueriedRequest<T> {
  return baseRequest.addon(QueryAddon).query(params);
}

export async function httpGet<T>({
  url,
  endpoint,
  wretchOptions = {},
  token,
  params,
  headers,
  handleError = defaultHandleError,
}: HttpGetOptions): Promise<T | void> {
  const api = createRequest<T>({ url, wretchOptions, token, headers });

  try {
    const response = await (params
      ? queryRequest({ baseRequest: api, params }).get(endpoint)
      : api.get(endpoint));
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpPut<T>({
  url,
  endpoint,
  wretchOptions = {},
  body = {},
  token,
  params,
  headers,
  handleError = defaultHandleError,
}: HttpPutOptions): Promise<T | void> {
  const api = createRequest<T>({ url, wretchOptions, token, headers });

  try {
    const response = await (params
      ? queryRequest({ baseRequest: api, params }).put(body, endpoint)
      : api.put(body, endpoint));
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpPost<T>({
  url,
  endpoint,
  wretchOptions = {},
  body = {},
  token,
  params,
  abortController,
  headers,
  handleError = defaultHandleError,
  errorType,
}: HttpPostOptions): Promise<T | void> {
  const api = createRequest<T>({
    url,
    wretchOptions,
    token,
    abortController,
    headers,
    errorType,
  });

  try {
    const response = await (params
      ? queryRequest({ baseRequest: api, params }).post(body, endpoint)
      : api.post(body, endpoint));
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpDelete<T>({
  url,
  endpoint,
  wretchOptions = {},
  token,
  params,
  headers,
  handleError = defaultHandleError,
}: HttpDeleteOptions): Promise<T | void> {
  const api = createRequest<T>({ url, wretchOptions, token, headers });

  try {
    const response = await (params
      ? queryRequest({ baseRequest: api, params }).delete(endpoint)
      : api.delete(endpoint));
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpPatch<T>({
  url,
  endpoint,
  wretchOptions = {},
  body = {},
  token,
  headers,
  handleError = defaultHandleError,
}: HttpPatchOptions): Promise<T | void> {
  const api = createRequest<T>({ url, wretchOptions, token, headers });

  try {
    const response = await api.patch(body, endpoint);
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

function createRawRequest({
  url,
  token,
  headers,
  abortController,
}: CreateRawRequestOptions): BaseRequest<RawResponse> {
  let base = (token ? wretch(url).auth(`Bearer ${token}`) : wretch(url))
    .addon(AbortAddon())
    .resolve((r) => r.res());

  if (headers) {
    base = base.headers(headers);
  }

  if (abortController) {
    base = base.signal(abortController);
  }

  return base;
}

export async function httpGetRaw({
  url,
  endpoint,
  token,
  params,
  abortController,
  handleError = defaultHandleError,
}: HttpGetRawOptions): Promise<RawResponse | void> {
  const api = createRawRequest({ url, token, abortController });

  try {
    const response = await (params
      ? queryRequest({ baseRequest: api, params }).get(endpoint)
      : api.get(endpoint));
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpPostRaw({
  url,
  endpoint,
  body = {},
  token,
  headers,
  abortController,
  handleError = defaultHandleError,
}: HttpPostRawOptions): Promise<RawResponse | void> {
  const api = createRawRequest({ url, token, headers, abortController });

  try {
    const response = await api.post(body, endpoint);
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpPutRaw({
  url,
  endpoint,
  body = {},
  token,
  headers,
  handleError = defaultHandleError,
}: HttpPutRawOptions): Promise<RawResponse | void> {
  const api = createRawRequest({ url, token, headers });

  try {
    const response = await api.put(body, endpoint);
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpPatchRaw({
  url,
  endpoint,
  body = {},
  token,
  headers,
  handleError = defaultHandleError,
}: HttpPatchRawOptions): Promise<RawResponse | void> {
  const api = createRawRequest({ url, token, headers });

  try {
    const response = await api.patch(body, endpoint);
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpDeleteRaw({
  url,
  endpoint,
  token,
  headers,
  handleError = defaultHandleError,
}: HttpDeleteRawOptions): Promise<RawResponse | void> {
  const api = createRawRequest({ url, token, headers });

  try {
    const response = await api.delete(endpoint);
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpHeadRaw({
  url,
  endpoint,
  token,
}: HttpHeadRawOptions): Promise<RawResponse | void> {
  const api = createRawRequest({ url, token });

  try {
    const response = await api.head(endpoint);
    return response;
  } catch (error) {
    defaultHandleError(error as WretchError);
  }
}

export async function httpFormDataPost<T>({
  url,
  endpoint,
  wretchOptions = {},
  body = {},
  token,
  abortController,
  handleError = defaultHandleError,
}: HttpFormDataPostOptions): Promise<T | void> {
  const api = createRequest<T>({
    url: url + endpoint,
    wretchOptions,
    token,
    abortController,
  });

  try {
    const response = await api
      .addon(FormDataAddon)
      .formData(body as Record<string, unknown>)
      .post();
    return response;
  } catch (error) {
    handleError(error as WretchError);
  }
}

export async function httpJsonDelete<T>({
  url,
  endpoint,
  wretchOptions = {},
  body = {},
  token,
}: HttpJsonDeleteOptions): Promise<T | void> {
  const api = createRequest<T>({ url, wretchOptions, token });

  try {
    const response = await api
      .json(body as Record<string, unknown>)
      .delete(endpoint);
    return response;
  } catch (error) {
    defaultHandleError(error as WretchError);
  }
}
