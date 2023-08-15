// 这个环境检测的代码复制于 https://stackoverflow.com/questions/7507638/any-standard-mechanism-for-detecting-if-a-javascript-is-executing-as-a-webworker
export const isNode = 'undefined' !== typeof global && '[object global]' === Object.prototype.toString.call(global);
export const isNodeProcess = isNode && !!process.env.NODE_UNIQUE_ID;
export const isWebWorker =
  !isNode &&
  'undefined' !== typeof WorkerGlobalScope &&
  'function' === typeof importScripts &&
  navigator instanceof WorkerNavigator;
export const isBrowser = !isNode && !isWebWorker && 'undefined' !== typeof navigator && 'undefined' !== typeof document;
export const isBrowserWindow = isBrowser && !!window.opener;
