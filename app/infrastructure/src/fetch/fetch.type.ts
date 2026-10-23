import { Wretch, WretchOptions } from 'wretch';
import { AbortResolver, AbortWretch } from 'wretch/addons/abort';
import { QueryStringAddon } from 'wretch/addons/queryString';
import { WretchError } from 'wretch/resolver';

type WretchQueryParams = string | object;

type HttpUrl = {
  url: string;
};

type HttpToken = {
  token?: string;
};

type HttpCoreOptions = HttpUrl &
  HttpToken & {
    endpoint: string;
  };

type HttpBaseOptions = HttpCoreOptions & {
  handleError?: (error: WretchError) => void;
};

type HttpBody = {
  body?: unknown;
};

type HttpHeaders = {
  headers?: HeadersInit;
};

type HttpParams = {
  params?: WretchQueryParams;
};

type HttpWretch = {
  wretchOptions?: WretchOptions;
};

type HttpAbort = {
  abortController?: AbortController;
};

type HttpError = {
  errorType?: 'json' | 'text';
};

type HttpExtendedOptions = HttpBaseOptions & HttpWretch & HttpHeaders;

export type BaseRequest<T> = AbortWretch &
  Wretch<AbortWretch, AbortResolver, Promise<Awaited<T>>>;

export type QueriedRequest<T> = QueryStringAddon &
  AbortWretch &
  Wretch<AbortWretch & QueryStringAddon, AbortResolver, Promise<Awaited<T>>>;

export type RawResponse = Response;

export type FetchError = WretchError;

export type CreateRequestOptions = HttpUrl &
  HttpToken &
  HttpWretch &
  HttpAbort &
  HttpHeaders &
  HttpError;

export type QueryRequestOptions<T> = {
  baseRequest: BaseRequest<T>;
} & Required<HttpParams>;

export type HttpGetOptions = HttpExtendedOptions & HttpParams;

export type HttpPutOptions = HttpExtendedOptions & HttpBody & HttpParams;

export type HttpPostOptions = HttpExtendedOptions &
  HttpBody &
  HttpParams &
  HttpAbort &
  HttpError;

export type HttpDeleteOptions = HttpExtendedOptions & HttpParams;

export type HttpPatchOptions = HttpExtendedOptions & HttpBody;

export type CreateRawRequestOptions = HttpUrl &
  HttpToken &
  HttpHeaders &
  HttpAbort;

export type HttpGetRawOptions = HttpBaseOptions & HttpParams & HttpAbort;

export type HttpPostRawOptions = HttpBaseOptions &
  HttpBody &
  HttpHeaders &
  HttpAbort;

export type HttpPutRawOptions = HttpBaseOptions & HttpBody & HttpHeaders;

export type HttpPatchRawOptions = HttpBaseOptions & HttpBody & HttpHeaders;

export type HttpDeleteRawOptions = HttpBaseOptions & HttpHeaders;

export type HttpHeadRawOptions = HttpCoreOptions;

export type HttpFormDataPostOptions = HttpBaseOptions &
  HttpWretch &
  HttpBody &
  HttpAbort;

export type HttpJsonDeleteOptions = HttpCoreOptions & HttpWretch & HttpBody;
