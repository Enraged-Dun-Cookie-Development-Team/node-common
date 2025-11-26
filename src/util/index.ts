// 这个环境检测的代码复制于 https://stackoverflow.com/questions/7507638/any-standard-mechanism-for-detecting-if-a-javascript-is-executing-as-a-webworker
export const isNode = 'undefined' !== typeof global && '[object global]' === Object.prototype.toString.call(global);
export const isNodeProcess = isNode && !!process.env.NODE_UNIQUE_ID;
export const isWebWorker =
  !isNode &&
  'undefined' !== typeof WorkerGlobalScope &&
  'function' === typeof importScripts &&
  navigator instanceof WorkerNavigator;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export const isBrowser = !isNode && !isWebWorker && 'undefined' !== typeof navigator && 'undefined' !== typeof document;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const isBrowserWindow = isBrowser && !!window.opener;
