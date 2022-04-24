import { RunwayTransportType } from "./config";
import { EventEmitter } from "./util";
import * as msgpack from "./msgpack";
import { Socket } from "./socket";

export enum PacketType {
  OPEN = 1,
  RETRY,
  RESET,
  REDIRECT,
  CLOSE,
  PING,
  PONG,
  MESSAGE,
  ACK
}

export interface PacketOpen {
  pingInterval: number;
  pingTimeout: number;
}

// eslint-disable-next-line
export interface PacketClose {
  reason: string;
}

// reconnect with same session id
export interface PacketRetry {
  delay: number; // delay seconds to reconnect
}

export interface PacketReset {
  delay: number; // delay seconds to reconnect
}

export interface PacketRedirect {
  delay: number; // delay seconds to connect
  target: string;
}

// eslint-disable-next-line
export interface PacketPing {}
// eslint-disable-next-line
export interface PacketPong {}

export interface PacketMessage {
  id: number;
  packageId: number;
  headers: Record<string, string>;
  payload: Uint8Array;
}

export interface PacketAck {
  id: number;
  packageId: number;
}

export type Packet = {
  type: PacketType;
  data:
    | PacketOpen
    | PacketRetry
    | PacketReset
    | PacketRedirect
    | PacketClose
    | PacketPing
    | PacketPong
    | PacketMessage
    | PacketAck;
};

export interface TransportOptions {
  url: string;
  query: Record<string, string>;
  socket: Socket;
  fetch: typeof fetch;
  WebSocket: typeof WebSocket;
}

export enum ConnectState {
  CONNECTING,
  CONNECTED,
  DISCONNECTED
}

export class Transport extends EventEmitter {
  type!: RunwayTransportType;
  readyState: ConnectState = ConnectState.CONNECTING;
  writable = false;
  constructor(public opts: TransportOptions) {
    super();
  }

  open() {
    //
  }
  close() {
    //
  }

  encodePacket(packet: Packet): Uint8Array | undefined {
    switch (packet.type) {
      case PacketType.PING:
      case PacketType.PONG:
        return msgpack.encode(packet.type);

      case PacketType.CLOSE:
        return msgpack.encode(
          [packet.type, (packet.data as PacketClose).reason],
          true
        );

      case PacketType.MESSAGE:
        return msgpack.encode(
          [
            packet.type,
            (packet.data as PacketMessage).id,
            (packet.data as PacketMessage).packageId,
            (packet.data as PacketMessage).headers || {},
            (packet.data as PacketMessage).payload
          ],
          true
        );

      case PacketType.ACK:
        return msgpack.encode(
          [
            packet.type,
            (packet.data as PacketAck).id,
            (packet.data as PacketAck).packageId
          ],
          true
        );

      default:
        return;
    }
  }
  decodePackets(buffer: Uint8Array): Packet[] {
    const packets: Packet[] = [];

    let items: any[];
    try {
      items = msgpack.decode(buffer, true);
    } catch (error) {
      console.error(error);
      return packets;
    }

    if (!items.length) return packets;

    function read(pos: number) {
      const type = items[pos];
      if (!type) return;

      switch (type) {
        case PacketType.OPEN:
          packets.push({
            type,
            data: { pingInterval: items[pos + 1], pingTimeout: items[pos + 2] }
          });
          read(pos + 3);
          break;
        case PacketType.RETRY:
        case PacketType.RESET:
          packets.push({
            type,
            data: { delay: items[pos + 1] }
          });
          read(pos + 2);
          break;
        case PacketType.REDIRECT:
          packets.push({
            type,
            data: { delay: items[pos + 1], target: items[pos + 2] }
          });
          read(pos + 3);
          break;
        case PacketType.CLOSE:
          packets.push({
            type,
            data: { reason: items[pos + 1] }
          });
          read(pos + 2);
          break;
        case PacketType.PING:
        case PacketType.PONG:
          packets.push({
            type,
            data: {}
          });
          read(pos + 1);
          break;
        case PacketType.MESSAGE:
          packets.push({
            type,
            data: {
              id: items[pos + 1],
              packageId: items[pos + 2],
              headers: items[pos + 3],
              payload: items[pos + 4]
            }
          });
          read(pos + 5);
          break;
        case PacketType.ACK:
          packets.push({
            type,
            data: {
              id: items[pos + 1],
              packageId: items[pos + 2]
            }
          });
          read(pos + 3);
          break;
      }
    }
    read(0);

    return packets;
  }

  send(packets: Packet[]) {
    this.write(packets);
  }
  write(packets: Packet[]) {
    //
  }

  onError(err: Error) {
    this.emit("error", err);
    return this;
  }
  onOpen() {
    this.readyState = ConnectState.CONNECTED;
    this.writable = true;
    this.emit("open");
  }
  onMessage(message: Uint8Array) {
    const packets = this.decodePackets(message);
    this.onPackets(packets);
  }
  onPackets(packets: Packet[]) {
    this.emit("packets", packets);
  }
  onClose() {
    this.readyState = ConnectState.DISCONNECTED;
    this.emit("close");
  }
}
