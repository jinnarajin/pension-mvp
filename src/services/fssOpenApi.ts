const FSS_API_BASE_PATH = "/api/fss";
const FSS_REQUEST_TIMEOUT_MS = 15000;

export interface FssPensionStatResponse {
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export interface RpGuaranteedProdListParams {
  areaCode: number;
  sysType: number;
  reportDate: string;
  productType?: number;
}

export interface PsGuaranteedProdListParams {
  areaCode?: number;
  channelCode?: number;
}

export interface FssApiResponse {
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export function getFssPensionStatRequestUrl(apiKey?: string): string {
  const url = new URL(`${FSS_API_BASE_PATH}/pensionStat.json`, window.location.origin);

  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  return url.toString();
}

export function getRpGuaranteedProdListRequestUrl(
  params: RpGuaranteedProdListParams,
  apiKey?: string
): string {
  const url = new URL(
    `${FSS_API_BASE_PATH}/rpGuaranteedProdList.json`,
    window.location.origin
  );

  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  url.searchParams.set("areaCode", String(params.areaCode));
  url.searchParams.set("sysType", String(params.sysType));
  url.searchParams.set("reportDate", params.reportDate);

  if (params.productType !== undefined) {
    url.searchParams.set("productType", String(params.productType));
  }

  return url.toString();
}

export function getPsGuaranteedProdListRequestUrl(
  params: PsGuaranteedProdListParams,
  apiKey?: string
): string {
  const url = new URL(
    `${FSS_API_BASE_PATH}/psGuaranteedProdList.json`,
    window.location.origin
  );

  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  if (params.areaCode !== undefined) {
    url.searchParams.set("areaCode", String(params.areaCode));
  }

  if (params.channelCode !== undefined) {
    url.searchParams.set("channelCode", String(params.channelCode));
  }

  return url.toString();
}

async function fetchFssJson<T extends FssApiResponse>(requestUrl: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FSS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`FSS OpenAPI 요청 실패: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function fetchFssPensionStat(): Promise<FssPensionStatResponse> {
  const apiKey = import.meta.env.VITE_FSS_OPENAPI_KEY as string | undefined;

  if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_FSS_OPENAPI_KEY_HERE") {
    throw new Error(".env 파일의 VITE_FSS_OPENAPI_KEY 값을 설정해 주세요.");
  }

  return fetchFssJson<FssPensionStatResponse>(
    getFssPensionStatRequestUrl(apiKey.trim())
  );
}

export async function fetchRpGuaranteedProdList(
  params: RpGuaranteedProdListParams
): Promise<FssApiResponse> {
  const apiKey = import.meta.env.VITE_FSS_OPENAPI_KEY as string | undefined;

  if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_FSS_OPENAPI_KEY_HERE") {
    throw new Error(".env 파일의 VITE_FSS_OPENAPI_KEY 값을 설정해 주세요.");
  }

  return fetchFssJson<FssApiResponse>(
    getRpGuaranteedProdListRequestUrl(params, apiKey.trim())
  );
}

export async function fetchPsGuaranteedProdList(
  params: PsGuaranteedProdListParams
): Promise<FssApiResponse> {
  const apiKey = import.meta.env.VITE_FSS_OPENAPI_KEY as string | undefined;

  if (!apiKey || apiKey.trim() === "" || apiKey === "YOUR_FSS_OPENAPI_KEY_HERE") {
    throw new Error(".env 파일의 VITE_FSS_OPENAPI_KEY 값을 설정해 주세요.");
  }

  return fetchFssJson<FssApiResponse>(
    getPsGuaranteedProdListRequestUrl(params, apiKey.trim())
  );
}