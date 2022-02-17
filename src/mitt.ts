// this file is modified from https://github.com/developit/mitt
// 1. return off fn when on
// 2. support once

type Handler = (event: any) => void;

export default class EventEmitter {
  private $all: Record<string, Handler[]> = {};
  on(type: string, handler: Handler) {
    (this.$all[type] || (this.$all[type] = [])).push(handler);
    return () => this.off(type, handler);
  }
  once(type: string, handler: Handler) {
    const off = this.on(type, event => off() && handler(event));
  }
  off(type: string, handler: Handler) {
    if (this.$all[type])
      this.$all[type].splice(this.$all[type].indexOf(handler) >>> 0, 1);
    return true;
  }
  emit(type: string, evt?: any) {
    (this.$all[type] || []).slice().map(handler => handler(evt));
  }
}
