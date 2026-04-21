/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `/auth/sign-in`; params?: Router.UnknownInputParams; } | { pathname: `/orders`; params?: Router.UnknownInputParams; } | { pathname: `/orders/checklist/[id]`, params: Router.UnknownInputParams & { id: string | number; } } | { pathname: `/orders/delivery/[id]`, params: Router.UnknownInputParams & { id: string | number; } };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/`; params?: Router.UnknownOutputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; } | { pathname: `/auth/sign-in`; params?: Router.UnknownOutputParams; } | { pathname: `/orders`; params?: Router.UnknownOutputParams; } | { pathname: `/orders/checklist/[id]`, params: Router.UnknownOutputParams & { id: string; } } | { pathname: `/orders/delivery/[id]`, params: Router.UnknownOutputParams & { id: string; } };
      href: Router.RelativePathString | Router.ExternalPathString | `/${`?${string}` | `#${string}` | ''}` | `/_sitemap${`?${string}` | `#${string}` | ''}` | `/auth/sign-in${`?${string}` | `#${string}` | ''}` | `/orders${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `/auth/sign-in`; params?: Router.UnknownInputParams; } | { pathname: `/orders`; params?: Router.UnknownInputParams; } | `/orders/checklist/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}` | `/orders/delivery/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}` | { pathname: `/orders/checklist/[id]`, params: Router.UnknownInputParams & { id: string | number; } } | { pathname: `/orders/delivery/[id]`, params: Router.UnknownInputParams & { id: string | number; } };
    }
  }
}
