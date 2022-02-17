import { RunwayTransportType } from "../config";
import { Packet, Transport, TransportOptions } from "../transport";
import { toQs } from "../util";

export class WebSocketTransport extends Transport {
  ws!: WebSocket;
  name = "websocket";
  constructor(opts: TransportOptions) {
    super(opts);
    this.type = RunwayTransportType.WEBSOCKET;
  }
  open() {
    const url = `${this.opts.url}?${toQs(this.opts.query)}`;

    this.ws = new this.opts.WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.onOpen();
    };

    this.ws.onclose = () => {
      this.onClose();
    };

    this.ws.onmessage = event => {
      this.onMessage(event.data);
    };

    this.ws.onerror = err => {
      this.onError("websocket error", err);
    };
  }
  write(packets: Packet[]) {
    this.writable = false;
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      const ub = this.encodePacket(packet);
      const ab = ub.buffer.slice(ub.byteOffset, ub.byteOffset + ub.byteLength);
      this.ws.send(ab);
    }

    this.emit("flush");
    setTimeout(() => {
      this.writable = true;
      this.emit("drain");
    }, 0);
  }
}
