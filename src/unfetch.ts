// this file is modified from https://github.com/developit/unfetch
// add a case for arraybuffer response

export default (p: PromiseConstructor): any => {
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
