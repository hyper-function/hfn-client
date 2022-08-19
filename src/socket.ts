import {
  ConnectState,
  Packet,
  PacketMessage,
  PacketOpen,
  PacketType,
  Transport
} from "./transport";
import { transports } from "./transports";
import HyperFunctionClient from "./client";
import { RunwayTransportType } from "./config";
import { EventEmitter, fromQs } from "./util";
import { encode, decode } from "./msgpack";

export type MessagePayload =
  | MessageCallHyperFunction
  | MessageSetState
  | MessageSetCookie
  | MessageRpcRequest
  | MessageRpcResponse
  | MessageCallHfn
  | MessageChangeHistory;

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

export type MessageCallHfn = [
  6,
  string /* hfn name */,
  Uint8Array | null /* payload */
];

export type MessageChangeHistory = [
  7,
  number /* action, 1: back, 2: forward, 3: go, 4: push, 5: replace */,
  number /* delta for go */,
  string /* path for push or replace */
];

export class Socket extends EventEmitter {
  transport?: Transport;
  writeBuffer: Packet[] = [];
  heartbeatAt = 0;
  healthCheckTimer!: ReturnType<typeof setTimeout>;
  pingInterval = 25;
  pingTimeout = 20;
  maxPayloadSize = 64;
  retrys = 0;
  constructor(public client: HyperFunctionClient) {
    super();
  }
  connect() {
    if (this.client.runway) {
      this.open(this.client.runway);
      return;
    }

    this.resolveRunway().then(runway => {
      this.open(runway);
    });
  }
  resolveRunway() {
    const { towers } = this.client;
    return Promise.resolve("");
  }
  open(runway: string) {
    const [url, qs] = runway.split("?");

    const type = /^ws/.test(url)
      ? RunwayTransportType.WEBSOCKET
      : RunwayTransportType.POLLING;

    let query: Record<string, string> = {};
    if (qs) query = fromQs(qs);

    query.aid = this.client.aid;
    query.cid = this.client.cid;
    query.sid = this.client.sid;
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
      this.transport &&
      this.transport.readyState === ConnectState.CONNECTED &&
      this.transport.writable &&
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
    this.heartbeatAt = Date.now();
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      switch (packet.type) {
        case PacketType.OPEN:
          this.onOpen(packet.data as PacketOpen);
          break;

        case PacketType.PING:
          this.send({ type: PacketType.PONG, data: {} });
          break;

        case PacketType.MESSAGE:
          this.emit("message", [
            (packet.data as PacketMessage).packageId,
            decode(
              (packet.data as PacketMessage).payload,
              true
            ) as MessagePayload
          ]);
          break;

        default:
          break;
      }
    }
  }
  onOpen(packet: PacketOpen) {
    this.pingInterval = packet.pingInterval;
    this.pingTimeout = packet.pingTimeout;
    this.retrys = 0;
    this.runHealthCheck();

    this.emit("connected");
    this.flush();
  }
  runHealthCheck() {
    const duration = Date.now() - this.heartbeatAt;
    if (duration > (this.pingTimeout + this.pingInterval) * 1000) {
      this.connect();
      return;
    }

    this.healthCheckTimer = setTimeout(() => {
      this.runHealthCheck();
    }, this.pingInterval);
  }
  onError(err: Error) {
    this.onClose("");
  }
  onClose(reason: string) {
    clearTimeout(this.healthCheckTimer);
    this.emit("disconnected");

    if (this.retrys > 6) return;
    const wait = this.retrys ? Math.pow(2, this.retrys) : 1;
    setTimeout(() => {
      this.connect();
    }, wait * 1000);

    this.retrys++;
  }
}
