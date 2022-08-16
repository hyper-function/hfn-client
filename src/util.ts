let decoder: TextDecoder;
export function toUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder != "undefined") {
    if (!decoder) decoder = new TextDecoder();
    return decoder.decode(bytes);
  }

  let i;
  const s = [];
  for (i = 0; i < bytes.length; i++) s.push(String.fromCharCode(bytes[i]));
  return decodeURIComponent(escape(s.join("")));
}

let encoder: TextEncoder;
export function fromUtf8(s: string): Uint8Array {
  if (typeof TextEncoder != "undefined") {
    if (!encoder) encoder = new TextEncoder();
    return encoder.encode(s);
  }

  let i;
  const d = unescape(encodeURIComponent(s)),
    b = new Uint8Array(d.length);
  for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
  return b;
}

export const toQs = (obj: Record<string, any>): string =>
  Object.keys(obj)
    .map(k => k + "=" + encodeURIComponent(obj[k]))
    .join("&");

export const fromQs = (qs: string): Record<string, string> =>
  qs.split("&").reduce((obj, item) => {
    const pair = item.split("=");
    obj[pair[0]] = decodeURIComponent(pair[1]);
    return obj;
  }, {} as Record<string, string>);

// nanoio
const urlAlphabet =
  "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

export const uniqueId = () => {
  let id = Date.now().toString(36).toUpperCase();
  let i = 13;
  while (i--) {
    id += urlAlphabet[(Math.random() * urlAlphabet.length) | 0];
  }
  return id;
};

// unfetch
export const buildFetch = (p: PromiseConstructor): any => {
  return function unfetch(
    url: string,
    options: { method: string; credentials: string; body: any }
  ) {
    options = options || {};
    return new p((resolve, reject) => {
      const request = new XMLHttpRequest();

      const response = () => ({
        ok: ((request.status / 100) | 0) == 2, // 200-299
        statusText: request.statusText,
        status: request.status,
        url: request.responseURL,
        text: () => p.resolve(request.responseText),
        json: () => p.resolve(request.responseText).then(JSON.parse),
        blob: () => p.resolve(new Blob([request.response])),
        arrayBuffer: () => p.resolve(request.response),
        clone: response
      });

      request.open(options.method || "get", url, true);

      request.onload = () => {
        resolve(response());
      };

      request.onerror = reject;

      request.withCredentials = options.credentials == "include";

      // special case for arraybuffer response
      if (ArrayBuffer.isView(options.body)) {
        request.responseType = "arraybuffer";
      }

      request.send(options.body || null);
    });
  };
};

// mitt
type Handler = (event: any) => void;

export class EventEmitter {
  private $all: Record<string, Handler[]> = {};
  on(type: string, handler: Handler) {
    (this.$all[type] || (this.$all[type] = [])).push(handler);
    return () => this.off(type, handler);
  }
  once(type: string, handler: Handler) {
    const off = this.on(type, event => off() && handler(event));
  }
  off(type: string, handler: Handler) {
    if (this.$all[type])
      this.$all[type].splice(this.$all[type].indexOf(handler) >>> 0, 1);
    return true;
  }
  emit(type: string, evt?: any) {
    (this.$all[type] || []).slice().map(handler => handler(evt));
  }
}

// const o = window.crypto || window.msCrypto;

// // @ts-expect-error: native or polyfill
// export const uuid = o.randomUUID
//   ? // @ts-expect-error: native or polyfill
//     () => o.randomUUID()
//   : () =>
//       // @ts-expect-error: magic
//       ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
//         (
//           c ^
//           (o.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
//         ).toString(16)
//       );

// export function getRandomValues(abv: Uint8Array) {
//   if (typeof window !== "undefined") {
//     const c = window.crypto || (window as any).msCrypto;
//     if (c) return c.getRandomValues(abv);
//   }

//   let l = abv.length;
//   while (l--) {
//     abv[l] = Math.floor(Math.random() * 256);
//   }
//   return abv;
// }

// export function nanoid(count: number) {
//   let result = "";
//   const randomArr = getRandomValues(new Uint8Array(count));
//   for (; count--; ) {
//     const n = 63 & randomArr[count];
//     result +=
//       n < 36
//         ? n.toString(36)
//         : n < 62
//         ? (n - 26).toString(36).toUpperCase()
//         : n < 63
//         ? "_"
//         : "-";
//   }
//   return result;
// }

// export const uniqueId = () =>
//   Date.now().toString(36).toUpperCase() + nanoid(13);

// export function toB64(bytes: Uint8Array): string {
//   let i;
//   const s = [];
//   for (i = 0; i < bytes.length; i++) s.push(String.fromCharCode(bytes[i]));
//   return btoa(s.join(""));
// }

// export function fromB64(s: string): Uint8Array {
//   let i;
//   const d = atob(s),
//     b = new Uint8Array(d.length);
//   for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
//   return b;
// }

// export function toB64Url(bytes: Uint8Array): string {
//   return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
// }

// export function fromB64Url(s: string): Uint8Array {
//   return fromB64(
//     (s + "===".slice((s.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/")
//   );
// }
