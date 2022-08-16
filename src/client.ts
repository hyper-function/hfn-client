import {
  MessageCallHfn,
  MessageCallHyperFunction,
  MessagePayload,
  MessageRpcRequest,
  MessageRpcResponse,
  MessageSetCookie,
  MessageSetState,
  Socket
} from "./socket";
import Model from "./model";
import * as util from "./util";
import * as msgpack from "./msgpack";
import { Config, HyperFunction, Module, Package } from "./config";

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

export default class HyperFunctionClient extends util.EventEmitter {
  id!: string;
  sessionId!: string;
  config!: Config;
  private socket!: Socket;
  private cookies: CookieItem[] = [];
  isReady = false;
  fetch: typeof fetch;
  Promise: PromiseConstructor;
  WebSocket: typeof WebSocket;
  private storage: Storage;
  private rpcAckId = 0;
  private pendingRpc: Record<
    number,
    {
      resolve: (value: Record<string, any>) => any;
      reject: () => any;
      timer: any;
    }
  > = {};

  constructor(
    config: string | Record<string, any>,
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
        ? util.buildFetch(this.Promise)
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

    const configIsString = typeof config === "string";
    if (configIsString && config.slice(0, 4) === "http") {
      this.fetch(config)
        .then(res => res.json())
        .then(res => {
          this.config = new Config(res.config);
          this.connect();
        });
      return;
    }

    this.config = new Config(configIsString ? JSON.parse(config) : config);
    this.connect();
  }

  connect() {
    this.storage.prefix = this.storage.prefix + "_HFN_" + this.config.id + "_";
    this.sessionId = util.uniqueId();

    this.storage.get("CID").then(id => {
      if (!id) {
        id = util.uniqueId();
        this.storage.set("CID", id);
      }

      this.id = id;

      this.prepareCookie();

      this.emit("connecting");

      this.socket = new Socket(this);
      this.socket.on("connected", () => {
        this.isReady = true;
        this.emit("connected");
      });

      this.socket.on("disconnected", () => {
        this.isReady = false;
        this.emit("disconnected");
      });
      this.socket.on("message", this.onMessage.bind(this));
      this.socket.connect();
    });
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
    const cookies: Record<string, string> = {};
    this.cookies.forEach(item => {
      if (item.packageId !== -1 && item.packageId !== packageId) return;
      if (item.maxAge !== -1 && now - item.createdAt > item.maxAge * 1000)
        return;

      cookies[item.name] = item.value;
    });

    return cookies;
  }

  private onMessage([pkgId, args]: [number, MessagePayload]) {
    switch (args[0]) {
      case 2:
        this.onSetStateMessage(args);
        break;
      case 3:
        this.onSetCookieMessage(pkgId, args);
        break;
      case 5:
        this.onRpcResponseMessage(pkgId, args);
        break;
      case 6:
        this.onCallHfnMessage(args);
        break;
    }
  }

  private onSetStateMessage(args: MessageSetState) {
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

  private onSetCookieMessage(packageId: number, args: MessageSetCookie) {
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

  private onRpcResponseMessage(packageId: number, args: MessageRpcResponse) {
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

  private onCallHfnMessage(args: MessageCallHfn) {
    const name = args[1];
    const payload = args[2];

    const hfn = this.config.hfns[name];
    if (!hfn) {
      console.log(`hfn: ${name} not found`);
      return;
    }

    this.callHfn(hfn, payload);
  }

  private callHfn(
    hfn: HyperFunction,
    data: Uint8Array | null,
    headers: Record<string, string> = {}
  ) {
    const packageId = hfn.module.pkg.id;
    const cookies = this.getCookie(packageId);

    const args: MessageCallHyperFunction = [
      1,
      hfn.module.id,
      hfn.id,
      cookies,
      data
    ];

    this.socket.sendMessage({
      packageId,
      headers,
      args
    });
  }

  hfn(
    name: string,
    payload: Record<string, any> | Model | null = null,
    opts: {
      headers?: Record<string, string>;
    } = {}
  ) {
    if (!this.isReady) {
      this.once("connected", () => {
        this.hfn(name, payload, opts);
      });
      return;
    }

    const hfn = this.config.hfns[name];
    if (!hfn) {
      console.log(`hfn: ${name} not found`);
      return;
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

    this.callHfn(hfn, data, opts.headers);
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
        this.once("connected", () => {
          this.rpc(name, payload, opts).then(resolve, reject);
        });
        return;
      }

      const rpc = this.config.rpcs[name];
      if (!rpc) {
        console.log(`rpc: ${name} not found`);
        return;
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

      const args: MessageRpcRequest = [4, rpc.id, rpcAckId, cookies, data];

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

export { HyperFunctionClient, msgpack, util };
