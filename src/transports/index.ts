import type { Transport } from "../transport";
import { WebSocketTransport } from "./websocket";

export const transports: Record<number, typeof Transport> = {
  0: WebSocketTransport
};
