import * as msgpack from "./msgpack";
import unfetch from "./unfetch";

import {
  MessageCallHyperFunction,
  MessagePayload,
  MessageRpcRequest,
  MessageRpcResponse,
  MessageSetCookie,
  MessageSetState,
  Socket
} from "./socket";
import { Config, Module, Package, HfnConfig } from "./config";
import Model from "./model";
import EventEmitter from "./mitt";

interface CookieItem {
  packageId: number;
  name: string;
  value: string;
  maxAge: number;
  createdAt: number;
}

interface Storage {
  prefix: string;
  get(key: string): Promise<string>;
  set(key: string, value: string): void;
}

export default class HyperFunctionClient extends EventEmitter {
  config!: Config;
  private socket!: Socket;
  private cookies: CookieItem[] = [];
  isReady = false;
  fetch: typeof fetch;
  Promise: PromiseConstructor;
  WebSocket: typeof WebSocket;
  storage: Storage;
  ackId = 0;
  rpcAckId = 0;
  pendingRpc: Record<
    number,
    {
      resolve: (value: Record<string, any>) => any;
      reject: () => any;
      timer: any;
    }
  > = {};

  constructor(
    config: string | HfnConfig,
    opts: {
      Promise?: PromiseConstructor;
      WebSocket?: typeof WebSocket;
      fetch?: typeof fetch;
      storage?: Storage;
    } = {}
  ) {
    super();
    // polyfills
    this.Promise = opts.Promise || Promise;
    this.WebSocket = opts.WebSocket || WebSocket;
    this.fetch = !opts.fetch
      ? typeof fetch === "undefined"
        ? unfetch(this.Promise)
        : fetch.bind(window)
      : opts.fetch;

    this.storage = opts.storage || {
      prefix: "",
      set(key, value) {
        localStorage.setItem(this.prefix + key, value);
      },
      get: key => {
        return this.Promise.resolve<string>(
          localStorage.getItem(this.storage.prefix + key) || ""
        );
      }
    };

    if (typeof config === "string") {
      if (config.slice(0, 4) === "http") {
        this.fetch(config)
          .then(res => res.json())
          .then(res => this.connect(res.config));
        return;
      }

      this.connect(JSON.parse(config));
    } else {
      this.connect(config);
    }
  }

  connect(hfnConfig: HfnConfig) {
    this.config = new Config(hfnConfig);
    this.storage.prefix = this.storage.prefix + "_HFN_" + this.config.id + "_";
    this.emit("configReady");

    this.socket = new Socket(this);
    this.socket.on("open", () => {
      this.isReady = true;
      this.emit("ready");
    });
    this.socket.on("message", this.handleMessage.bind(this));

    this.prepareCookie();
  }
  private prepareCookie() {
    this.storage.get("COOKIES").then(cookieValue => {
      if (!cookieValue) return;

      let cookies: CookieItem[] = [];
      try {
        cookies = JSON.parse(cookieValue);
      } catch (error) {
        console.error("fail to parse cookie string", error);
      }

      if (!cookies.length) return;

      const now = Date.now();
      cookies = cookies.filter(
        item => item.maxAge === -1 || now - item.createdAt < item.maxAge * 1000
      );

      this.cookies = cookies;
      this.persistCookie();
    });
  }

  private persistCookie() {
    const cookieValue = JSON.stringify(this.cookies);

    this.storage.set("COOKIES", cookieValue);
  }

  private getCookie(packageId: number) {
    const now = Date.now();
    const cookies: [string, string][] = [];
    this.cookies.forEach(item => {
      if (item.packageId !== -1 && item.packageId !== packageId) return;
      if (item.maxAge !== -1 && now - item.createdAt > item.maxAge * 1000)
        return;

      cookies.push([item.name, item.value]);
    });

    return cookies;
  }

  private handleMessage([pkgId, args]: [number, MessagePayload]) {
    switch (args[0]) {
      case 2:
        this.handleSetStateMessage(args);
        break;
      case 3:
        this.handleSetCookieMessage(pkgId, args);
        break;
      case 5:
        this.handleRpcResponse(pkgId, args);
        break;
    }
  }

  private handleSetStateMessage(args: MessageSetState) {
    const pkgId = args[1];
    const moduleId = args[2];
    const pkg = this.config.packages[pkgId];

    if (!pkg) return;
    const mod = pkg.modules[moduleId];

    if (!mod) return;
    const model = new Model(mod.models[0].schema, this.config);
    model.decode(args[3]);

    this.emit("state", { package: pkg, module: mod, state: model });
  }

  private handleSetCookieMessage(packageId: number, args: MessageSetCookie) {
    const name = args[1];
    const value = args[2];
    const maxAge = args[3];
    const isPrivate = args[4];

    if (!isPrivate) packageId = -1;
    this.cookies = this.cookies.filter(
      item => !(item.packageId === packageId && item.name === name)
    );

    this.cookies.push({
      packageId,
      name,
      value,
      maxAge,
      createdAt: Date.now()
    });

    this.persistCookie();
  }

  handleRpcResponse(packageId: number, args: MessageRpcResponse) {
    const rpcId = args[1];
    const rpcAckId = args[2];
    const payload = args[3];

    const pkg = this.config.packages[packageId];
    const rpc = this.config.rpcs[`${pkg.id}-${rpcId}`];
    const pending = this.pendingRpc[rpcAckId];
    if (!pending) return;

    clearTimeout(pending.timer);
    const model = new Model(rpc.resSchema, this.config);
    model.decode(payload!);

    const obj = model.toObject();

    pending.resolve(obj);
    delete this.pendingRpc[rpcAckId];
  }

  hfn(
    name: string,
    payload: Record<string, any> | Model | null = null,
    opts: {
      headers?: Record<string, string>;
    } = {}
  ) {
    if (!this.isReady) {
      this.once("ready", () => {
        this.hfn(name, payload, opts);
      });
      return;
    }

    const hfn = this.config.hfns[name];
    if (!hfn) {
      console.log(`hfn: ${name} not found`);
      return false;
    }

    let data: Uint8Array | null = null;
    if (!payload) {
      // pass
    } else if (payload instanceof Model) {
      data = payload.encode();
    } else if (typeof payload === "object") {
      const model = new Model(hfn.shcema, this.config);
      model.fromObject(payload);
      data = model.encode();
    }

    const packageId = hfn.module.pkg.id;
    const cookies = this.getCookie(packageId);

    const headers = opts.headers || {};

    const args: MessageCallHyperFunction = [
      1,
      hfn.module.id,
      hfn.id,
      cookies.length ? msgpack.encode(cookies) : null,
      data
    ];

    this.socket.sendMessage({
      packageId,
      headers,
      args
    });

    return true;
  }

  rpc(
    name: string,
    payload: Record<string, any> | Model | null = null,
    opts: {
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<Record<string, any>> {
    return new this.Promise((resolve, reject) => {
      if (!this.isReady) {
        this.once("ready", () => {
          this.rpc(name, payload, opts).then(resolve, reject);
        });
        return;
      }

      const rpc = this.config.rpcs[name];
      if (!rpc) {
        console.log(`rpc: ${name} not found`);
        return false;
      }

      let data: Uint8Array | null = null;
      if (!payload) {
        // pass
      } else if (payload instanceof Model) {
        data = payload.encode();
      } else if (typeof payload === "object") {
        const model = new Model(rpc.reqSchema, this.config);
        model.fromObject(payload);
        data = model.encode();
      }

      const packageId = rpc.pkg.id;
      const cookies = this.getCookie(packageId);
      const headers = opts.headers || {};

      let timeout = 60;
      if (opts && opts.timeout) timeout = opts.timeout;

      const rpcAckId = this.rpcAckId++;

      const timer = setTimeout(() => {
        reject(new Error("timeout"));
        delete this.pendingRpc[rpcAckId];
      }, timeout * 1000);

      this.pendingRpc[rpcAckId] = {
        resolve,
        reject,
        timer
      };

      const args: MessageRpcRequest = [
        4,
        rpc.id,
        rpcAckId,
        cookies.length ? msgpack.encode(cookies) : null,
        data
      ];

      this.socket.sendMessage({
        packageId,
        headers,
        args
      });
    });
  }

  subscribe(
    handler: (change: {
      package: Package;
      module: Module;
      state: Model;
    }) => void
  ) {
    return this.on("state", handler);
  }

  model(name: string) {
    const model = this.config.models[name];
    if (!model) {
      console.log(`model: ${name} not found`);
      return false;
    }

    return new Model(model.schema, this.config);
  }
}

export * as util from "./util";

export { HyperFunctionClient, EventEmitter, unfetch };
