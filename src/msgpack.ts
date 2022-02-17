// this file is modified from https://github.com/ygoe/msgpack.js

import { toUtf8, fromUtf8 } from "./util";

export function encode(data: any, multiple?: boolean): Uint8Array {
  if (multiple && !Array.isArray(data)) {
    throw new Error(
      "Invalid argument type: Expected an Array to encode multiple values."
    );
  }

  let floatBuffer: ArrayBuffer, floatView: DataView;
  let array = new Uint8Array(128);
  let length = 0;
  if (multiple) {
    for (let i = 0; i < data.length; i++) {
      append(data[i]);
    }
  } else {
    append(data);
  }
  return array.subarray(0, length);

  function append(data: any) {
    switch (typeof data) {
      case "undefined":
        appendNull(data);
        break;
      case "boolean":
        appendBoolean(data);
        break;
      case "number":
        appendNumber(data);
        break;
      case "string":
        appendString(data);
        break;
      case "object":
        if (data === null) appendNull(data);
        else if (Array.isArray(data)) appendArray(data);
        else if (
          data instanceof Uint8Array ||
          data instanceof Uint8ClampedArray
        )
          appendBinArray(data);
        else if (
          data instanceof Int8Array ||
          data instanceof Int16Array ||
          data instanceof Uint16Array ||
          data instanceof Int32Array ||
          data instanceof Uint32Array ||
          data instanceof Float32Array ||
          data instanceof Float64Array
        )
          appendArray(data);
        else appendObject(data);
        break;
      default:
        throw new Error(
          "Invalid argument type: The type '" +
            typeof data +
            "' cannot be encode."
        );
    }
  }

  function appendNull(data: any) {
    appendByte(0xc0);
  }

  function appendBoolean(data: boolean) {
    appendByte(data ? 0xc3 : 0xc2);
  }

  function appendNumber(data: number) {
    if (data % 1 === 0 && data >= -2147483648 && data <= 2147483647) {
      // Integer
      if (data >= 0 && data <= 0x7f) {
        appendByte(data);
      } else if (data < 0 && data >= -0x20) {
        appendByte(data);
      } else if (data > 0 && data <= 0xff) {
        // uint8
        appendBytes([0xcc, data]);
      } else if (data >= -0x80 && data <= 0x7f) {
        // int8
        appendBytes([0xd0, data]);
      } else if (data > 0 && data <= 0xffff) {
        // uint16
        appendBytes([0xcd, data >>> 8, data]);
      } else if (data >= -0x8000 && data <= 0x7fff) {
        // int16
        appendBytes([0xd1, data >>> 8, data]);
      } else if (data > 0 && data <= 0xffffffff) {
        // uint32
        appendBytes([0xce, data >>> 24, data >>> 16, data >>> 8, data]);
      } else if (data >= -0x80000000 && data <= 0x7fffffff) {
        // int32
        appendBytes([0xd2, data >>> 24, data >>> 16, data >>> 8, data]);
      }
    } else {
      // Float
      if (!floatView) {
        floatBuffer = new ArrayBuffer(8);
        floatView = new DataView(floatBuffer);
      }
      floatView.setFloat64(0, data);
      appendByte(0xcb);
      appendBytes(new Uint8Array(floatBuffer));
    }
  }

  function appendString(data: string) {
    const bytes = fromUtf8(data);
    const length = bytes.length;

    if (length <= 0x1f) appendByte(0xa0 + length);
    else if (length <= 0xff) appendBytes([0xd9, length]);
    else if (length <= 0xffff) appendBytes([0xda, length >>> 8, length]);
    else
      appendBytes([0xdb, length >>> 24, length >>> 16, length >>> 8, length]);

    appendBytes(bytes);
  }

  function appendArray(data: any) {
    const length = data.length;

    if (length <= 0xf) appendByte(0x90 + length);
    else if (length <= 0xffff) appendBytes([0xdc, length >>> 8, length]);
    else
      appendBytes([0xdd, length >>> 24, length >>> 16, length >>> 8, length]);

    for (let index = 0; index < length; index++) {
      append(data[index]);
    }
  }

  function appendBinArray(data: any) {
    const length = data.length;

    if (length < 0x100) appendBytes([0xc4, length]);
    else if (length < 0x10000) appendBytes([0xc5, length >>> 8, length]);
    else
      appendBytes([0xc6, length >>> 24, length >>> 16, length >>> 8, length]);

    appendBytes(data);
  }

  function appendObject(data: any) {
    let length = 0;
    for (const key in data) {
      if (data[key] !== undefined) {
        length++;
      }
    }

    if (length <= 0xf) appendByte(0x80 + length);
    else if (length <= 0xffff) appendBytes([0xde, length >>> 8, length]);
    else
      appendBytes([0xdf, length >>> 24, length >>> 16, length >>> 8, length]);

    for (const key in data) {
      const value = data[key];
      if (value !== undefined) {
        append(key);
        append(value);
      }
    }
  }

  function appendByte(byte: any) {
    if (array.length < length + 1) {
      let newLength = array.length * 2;
      while (newLength < length + 1) newLength *= 2;
      const newArray = new Uint8Array(newLength);
      newArray.set(array);
      array = newArray;
    }
    array[length] = byte;
    length++;
  }

  function appendBytes(bytes: any) {
    if (array.length < length + bytes.length) {
      let newLength = array.length * 2;
      while (newLength < length + bytes.length) newLength *= 2;
      const newArray = new Uint8Array(newLength);
      newArray.set(array);
      array = newArray;
    }
    array.set(bytes, length);
    length += bytes.length;
  }
}

export function decode(array: Uint8Array, multiple?: boolean) {
  let pos = 0;
  if (array instanceof ArrayBuffer) {
    array = new Uint8Array(array);
  }
  if (typeof array !== "object" || typeof array.length === "undefined") {
    throw new Error(
      "Invalid argument type: Expected a byte array (Array or Uint8Array) to decode."
    );
  }
  if (!array.length) {
    throw new Error("Invalid argument: The byte array to decode is empty.");
  }
  if (!(array instanceof Uint8Array)) {
    array = new Uint8Array(array);
  }
  let data;
  if (multiple) {
    // Read as many messages as are available
    data = [];
    while (pos < array.length) {
      data.push(read());
    }
  } else {
    // Read only one message and ignore additional data
    data = read();
  }
  return data;

  function read(): any {
    const byte = array[pos++];
    if (byte >= 0x00 && byte <= 0x7f) return byte; // positive fixint
    if (byte >= 0x80 && byte <= 0x8f) return readMap(byte - 0x80); // fixmap
    if (byte >= 0x90 && byte <= 0x9f) return readArray(byte - 0x90); // fixarray
    if (byte >= 0xa0 && byte <= 0xbf) return readStr(byte - 0xa0); // fixstr
    if (byte === 0xc0) return null; // nil
    if (byte === 0xc1) throw new Error("Invalid byte code 0xc1 found."); // never used
    if (byte === 0xc2) return false; // false
    if (byte === 0xc3) return true; // true
    if (byte === 0xc4) return readBin(-1, 1); // bin 8
    if (byte === 0xc5) return readBin(-1, 2); // bin 16
    if (byte === 0xc6) return readBin(-1, 4); // bin 32
    if (byte === 0xca) return readFloat(4); // float 32
    if (byte === 0xcb) return readFloat(8); // float 64
    if (byte === 0xcc) return readUInt(1); // uint 8
    if (byte === 0xcd) return readUInt(2); // uint 16
    if (byte === 0xce) return readUInt(4); // uint 32
    if (byte === 0xcf) return readUInt(8); // uint 64
    if (byte === 0xd0) return readInt(1); // int 8
    if (byte === 0xd1) return readInt(2); // int 16
    if (byte === 0xd2) return readInt(4); // int 32
    if (byte === 0xd3) return readInt(8); // int 64
    if (byte === 0xd9) return readStr(-1, 1); // str 8
    if (byte === 0xda) return readStr(-1, 2); // str 16
    if (byte === 0xdb) return readStr(-1, 4); // str 32
    if (byte === 0xdc) return readArray(-1, 2); // array 16
    if (byte === 0xdd) return readArray(-1, 4); // array 32
    if (byte === 0xde) return readMap(-1, 2); // map 16
    if (byte === 0xdf) return readMap(-1, 4); // map 32
    if (byte >= 0xe0 && byte <= 0xff) return byte - 256; // negative fixint
    console.debug("msgpack array:", array);
    throw new Error(
      "Invalid byte value '" +
        byte +
        "' at index " +
        (pos - 1) +
        " in the MessagePack binary data (length " +
        array.length +
        "): Expecting a range of 0 to 255. This is not a byte array."
    );
  }

  function readInt(size: number) {
    let value = 0;
    let first = true;
    while (size-- > 0) {
      if (first) {
        const byte = array[pos++];
        value += byte & 0x7f;
        if (byte & 0x80) {
          value -= 0x80; // Treat most-significant bit as -2^i instead of 2^i
        }
        first = false;
      } else {
        value *= 256;
        value += array[pos++];
      }
    }
    return value;
  }

  function readUInt(size: any) {
    let value = 0;
    while (size-- > 0) {
      value *= 256;
      value += array[pos++];
    }
    return value;
  }

  function readFloat(size: number) {
    const view = new DataView(array.buffer, pos + array.byteOffset, size);
    pos += size;
    if (size === 4) return view.getFloat32(0, false);
    if (size === 8) return view.getFloat64(0, false);
  }

  function readBin(size: number, lengthSize?: number) {
    if (size < 0) size = readUInt(lengthSize);
    const data = array.subarray(pos, pos + size);
    pos += size;
    return data;
  }

  function readMap(size: number, lengthSize?: number) {
    if (size < 0) size = readUInt(lengthSize);
    const data: any = {};
    while (size-- > 0) {
      const key = read();
      data[key] = read();
    }
    return data;
  }

  function readArray(size: number, lengthSize?: number) {
    if (size < 0) size = readUInt(lengthSize);
    const data = [];
    while (size-- > 0) {
      data.push(read());
    }
    return data;
  }

  function readStr(size: number, lengthSize?: number) {
    if (size < 0) size = readUInt(lengthSize);
    const start = pos;
    pos += size;
    return toUtf8(array.slice(start, pos));
  }
}
