import EventEmitter from "./mitt";

import {
  Packet,
  PacketMessage,
  PacketOpen,
  PacketType,
  Transport
} from "./transport";
import { transports } from "./transports";
import HyperFunctionClient from "./client";
import { RunwayTransportType } from "./config";
import { fromQs, uniqueId } from "./util";
import { encode, decode } from "./msgpack";

export type MessagePayload =
  | MessageCallHyperFunction
  | MessageSetState
  | MessageSetCookie
  | MessageRpcRequest
  | MessageRpcResponse;

export type MessageCallHyperFunction = [
  1,
  number /* module id */,
  number /* hfn id */,
  Record<string, string> /* cookies */,
  Uint8Array | null /* payload */
];

export type MessageSetState = [
  2,
  number /* package id */,
  number /* module id */,
  Uint8Array /* payload */
];

export type MessageSetCookie = [
  3,
  string /* name */,
  string /* value */,
  number /* maxAge */,
  boolean /* isPrivate */
];

export type MessageRpcRequest = [
  4,
  number /* rpc id */,
  number /* rpc ack id */,
  Record<string, string> /* cookies */,
  Uint8Array | null /* request payload */
];

export type MessageRpcResponse = [
  5,
  number /* rpc id */,
  number /* rpc ack id */,
  Uint8Array | null /* response payload */
];

export enum SocketReadyState {
  CONNECTING,
  CONNECTED,
  DISCONNECTED
}

export class Socket extends EventEmitter {
  // client id
  cid!: string;
  // session id
  ssid!: string;
  transport?: Transport;
  readyState: SocketReadyState = SocketReadyState.CONNECTING;
  writeBuffer: Packet[] = [];
  heartbeatAt = 0;
  healthCheckTimer!: ReturnType<typeof setTimeout>;
  pingInterval = 25;
  pingTimeout = 20;
  maxPayloadSize = 64;
  retrys = 0;
  constructor(public client: HyperFunctionClient) {
    super();

    this.ssid = uniqueId();
    this.client.storage.get("CID").then(cid => {
      if (!cid) {
        cid = uniqueId();
        this.client.storage.set("CID", cid);
      }

      this.cid = cid;
      this.connect();
    });
  }
  handleBeforeUnload() {
    // send close packet
  }
  handleOffline() {
    //
  }
  connect() {
    if (this.client.config.runway) {
      this.open(this.client.config.runway);
      return;
    }

    this.resolveRunway().then(runway => {
      this.open(runway);
    });
  }
  resolveRunway() {
    const { towers } = this.client.config;
    return Promise.resolve("");
  }
  open(runway: string) {
    const [url, qs] = runway.split("?");

    const type = /^ws/.test(url)
      ? RunwayTransportType.WEBSOCKET
      : RunwayTransportType.POLLING;

    let query: Record<string, string> = {};
    if (qs) query = fromQs(qs);

    query.aid = this.client.config.id;
    query.cid = this.cid;
    query.sid = this.ssid;
    query.ver = process.env.VERSION as string;
    query.ts = Date.now().toString();

    const transport = new transports[type]({
      url,
      query,
      socket: this,
      fetch: this.client.fetch,
      WebSocket: this.client.WebSocket
    });

    transport.open();
    this.setTransport(transport);
  }
  setTransport(transport: Transport) {
    this.transport = transport;

    transport.on("drain", () => {
      this.onDrain();
    });
    transport.on("packets", (packets: any) => {
      this.onPackets(packets);
    });
    transport.on("error", (e: Error) => {
      this.onError(e);
    });
    transport.on("close", () => {
      this.onClose("transport close");
    });
  }
  sendMessage({
    packageId,
    headers,
    args,
    ack,
    ackTimeout
  }: {
    packageId: number;
    headers: Record<string, string>;
    args: MessagePayload;
    ack?: () => void;
    ackTimeout?: number;
  }) {
    const msg: PacketMessage = {
      id: 0,
      packageId,
      headers,
      payload: encode(args, true)
    };
    this.send({ type: PacketType.MESSAGE, data: msg });
  }
  send(packet: Packet) {
    this.writeBuffer.push(packet);

    this.flush();
  }
  flush() {
    if (
      this.readyState === SocketReadyState.CONNECTED &&
      this.transport?.writable &&
      this.writeBuffer.length
    ) {
      const wbuf = this.writeBuffer;
      this.writeBuffer = [];
      this.transport.write(wbuf);
      this.emit("flush");
    }
  }
  onDrain() {
    if (!this.writeBuffer.length) {
      this.emit("drain");
    } else {
      this.flush();
    }
  }
  onPackets(packets: Packet[]) {
    if (this.readyState === SocketReadyState.DISCONNECTED) return;

    this.heartbeatAt = Date.now();
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      switch (packet.type) {
        case PacketType.OPEN: {
          this.onOpen(packet.data as PacketOpen);
          break;
        }

        case PacketType.MESSAGE: {
          const data = packet.data as PacketMessage;
          const args = decode(data.payload, true) as MessagePayload;
          this.emit("message", [data.packageId, args]);
          break;
        }

        default:
          break;
      }
    }
  }
  onOpen(packet: PacketOpen) {
    this.readyState = SocketReadyState.CONNECTED;

    this.pingInterval = packet.pingInterval;
    this.pingTimeout = packet.pingTimeout;
    this.retrys = 0;
    this.runHealthCheck();

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.handleBeforeUnload, false);
      window.addEventListener("offline", this.handleOffline, false);
    }

    this.emit("open");
    this.flush();
  }
  runHealthCheck() {
    const duration = Date.now() - this.heartbeatAt;
    if (duration > (this.pingTimeout + this.pingInterval) * 1000) {
      // reconnect
      return;
    }

    this.healthCheckTimer = setTimeout(() => {
      this.runHealthCheck();
    }, this.pingInterval);
  }
  onError(err: Error) {
    //
  }
  onClose(reason: string) {
    clearTimeout(this.healthCheckTimer);
    if (this.retrys > 10) return;
    const wait = Math.floor(Math.random() * ((2 + this.retrys) * 1000));
    setTimeout(() => {
      this.connect();
    }, wait);

    this.retrys++;
  }
}
