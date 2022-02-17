import { RunwayTransportType } from "./config";
import EventEmitter from "./mitt";
import * as msgpack from "./msgpack";
import { MessagePayload, Socket } from "./socket";

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
  pi?: number; // ping interval second, default is 25s
  pt?: number; // ping timeout second, default is 20s
}

// reconnect with same session id
export interface PacketRetry {
  delay?: number; // delay seconds to reconnect
}

export interface PacketReset {
  delay?: number; // delay seconds to reconnect
}

export interface PacketRedirect {
  target: string;
}

// eslint-disable-next-line
export interface PacketClose {}
// eslint-disable-next-line
export interface PacketPing {}
// eslint-disable-next-line
export interface PacketPong {}

export interface PacketMessage {
  id: number;
  packageId: number;
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
  OPEN,
  CLOSED
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

  encodePacket(packet: Packet): Uint8Array {
    switch (packet.type) {
      case PacketType.OPEN:
      case PacketType.RETRY:
      case PacketType.RESET:
      case PacketType.REDIRECT:
      case PacketType.CLOSE:
      case PacketType.PING:
      case PacketType.PONG: {
        return msgpack.encode([packet.type, packet.data || {}], true);
      }
      case PacketType.MESSAGE: {
        const message = packet.data as PacketMessage;

        return msgpack.encode(
          [packet.type, message.id, message.packageId, message.payload],
          true
        );
      }
      case PacketType.ACK: {
        const ack = packet.data as PacketAck;
        return msgpack.encode([packet.type, ack.id, ack.packageId], true);
      }
    }

    // TODO: throw error
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
        case PacketType.RETRY:
        case PacketType.RESET:
        case PacketType.REDIRECT:
        case PacketType.CLOSE:
        case PacketType.PING:
        case PacketType.PONG:
          packets.push({
            type,
            data: items[pos + 1]
          });
          read(pos + 2);
          break;
        case PacketType.MESSAGE:
          packets.push({
            type,
            data: {
              id: items[pos + 1],
              packageId: items[pos + 2],
              payload: items[pos + 3]
            }
          });
          read(pos + 4);
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

  onError(msg: string, desc: any) {
    const err = new Error(msg);
    (err as any).type = "TransportError";
    (err as any).description = desc;
    this.emit("error", err);
    return this;
  }
  onOpen() {
    this.readyState = ConnectState.OPEN;
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
    this.readyState = ConnectState.CLOSED;
    this.emit("close");

    console.log("websocket closed");
  }
}
