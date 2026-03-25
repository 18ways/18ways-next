export type WaysRouteParams = Record<string, string | string[] | undefined>;

export type WaysMaybePromise<T> = T | Promise<T>;

export type WaysServerRouteContext = {
  params?: WaysMaybePromise<WaysRouteParams>;
  pathname?: string;
  origin?: string;
};

export const resolveWaysParams = async (
  params: WaysMaybePromise<WaysRouteParams> | undefined
): Promise<WaysRouteParams | undefined> => {
  if (!params) {
    return undefined;
  }

  return await params;
};

export const resolveRouteLocaleFromParams = async (
  params: WaysMaybePromise<WaysRouteParams> | undefined,
  localeParamName = 'lang'
): Promise<string | undefined> => {
  const resolvedParams = await resolveWaysParams(params);
  const rawValue = resolvedParams?.[localeParamName];

  if (typeof rawValue === 'string') {
    return rawValue;
  }

  return undefined;
};
