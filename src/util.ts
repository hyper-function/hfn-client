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

export function getRandomValues(abv: Uint8Array) {
  if (typeof window !== "undefined") {
    const c = window.crypto || (window as any).msCrypto;
    if (c) return c.getRandomValues(abv);
  }

  let l = abv.length;
  while (l--) {
    abv[l] = Math.floor(Math.random() * 256);
  }
  return abv;
}

export function nanoid(count: number) {
  let result = "";
  const randomArr = getRandomValues(new Uint8Array(count));
  for (; count--; ) {
    const n = 63 & randomArr[count];
    result +=
      n < 36
        ? n.toString(36)
        : n < 62
        ? (n - 26).toString(36).toUpperCase()
        : n < 63
        ? "_"
        : "-";
  }
  return result;
}

export const uniqueId = () =>
  Date.now().toString(36).toUpperCase() + nanoid(13);

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
