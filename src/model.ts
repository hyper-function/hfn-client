import { encode, decode } from "./msgpack";
import { Config, Schema } from "./config";

const isInteger =
  Number.isInteger || ((x: any) => typeof x === "number" && x % 1 === 0);

function checkType(value: any, type: string) {
  switch (type) {
    case "s":
      return value === value + "";
    case "i":
      return isInteger(value) && value <= 2147483647 && value >= -2147483648;
    case "f":
      return !isNaN(value) && typeof value === "number";
    case "b":
      return value === !!value;
    case "t":
      return value instanceof Uint8Array;
  }
}

export default class Model {
  private data: Record<string, any>;
  constructor(public schema: Schema, public config: Config) {
    this.data = Object.create(null);
  }

  set(key: string, value: any) {
    if (typeof value === "undefined") return false;
    const field = this.schema.fields[key];
    if (!field) return false;

    const isArray = Array.isArray(value);
    if (field.isArray && !isArray) return false;

    if (field.type.length === 1) {
      // scalar type
      if (isArray) {
        for (let i = 0; i < value.length; i++) {
          if (!checkType(value[i], field.type)) return false;
        }
      } else {
        if (!checkType(value, field.type)) return false;
      }
    } else {
      // model type
      const targetSchema = this.config.schemas[field.type];
      if (!targetSchema) return false;
      if (isArray) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (!(item instanceof Model) || item.schema._id !== field.type)
            return false;
        }
      } else {
        if (!(value instanceof Model) || value.schema._id !== field.type)
          return false;
      }
    }

    this.data[key] = value;
    return true;
  }
  get(key: string) {
    return this.data[key];
  }
  has(key: string) {
    return !!this.data[key];
  }
  keys() {
    return Object.keys(this.data);
  }
  delete(key: string) {
    delete this.data[key];
  }
  encode() {
    const keys = this.keys();
    const dataArr = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const field = this.schema.fields[key];
      dataArr.push(field.id);

      let value;
      if (field.type.length === 1) {
        // scalar type
        value = this.data[key];
      } else {
        // model type
        if (field.isArray) {
          value = this.data[key].map((item: Model) => item.encode());
        } else {
          value = this.data[key].encode();
        }
      }

      dataArr.push(value);
    }

    return encode(dataArr, true);
  }
  decode(data: Uint8Array) {
    if (!data.byteLength) return false;
    let dataArr = [];
    try {
      dataArr = decode(data, true);
    } catch (error) {
      console.log(error);
      return false;
    }

    let field = null;
    for (let i = 0; i < dataArr.length; i++) {
      const item = dataArr[i];
      if (!field) {
        field = this.schema.fields[item];
        if (!field) return false;
        continue;
      }

      let value;
      if (field.type.length === 1) {
        value = item;
      } else {
        const targetSchema = this.config.schemas[field.type];
        if (!targetSchema) return false;
        if (field.isArray) {
          value = item.map((data: Uint8Array) => {
            const m = new Model(targetSchema, this.config);
            m.decode(data);
            return m;
          });
        } else {
          value = new Model(targetSchema, this.config);
          value.decode(item);
        }
      }

      this.set(field.name, value);
      field = null;
    }
  }
  from(obj: any) {
    return this.fromObject(obj);
  }
  fromObject(obj: any) {
    if (typeof obj !== "object") return null;
    Object.keys(obj).forEach(key => {
      const field = this.schema.fields[key];
      if (!field) return null;
      if (field.type.length === 1) {
        this.set(key, obj[key]);
      } else {
        if (field.isArray) {
          this.set(
            key,
            obj[key].map((item: any) => {
              const m = new Model(this.config.schemas[field.type], this.config);
              m.fromObject(item);
              return m;
            })
          );
        } else {
          const m = new Model(this.config.schemas[field.type], this.config);
          m.fromObject(obj[key]);
          this.set(key, m);
        }
      }
    });
    return this;
  }
  to() {
    return this.toObject();
  }
  toObject() {
    const obj: Record<string, any> = {};
    this.keys().forEach(key => {
      const field = this.schema.fields[key];
      if (!field) return;

      const value = this.get(key);
      if (field.type.length === 1) {
        obj[key] = value;
      } else {
        if (field.isArray) {
          obj[key] = value.map((item: Model) => item.toObject());
        } else {
          obj[key] = value.toObject();
        }
      }
    });
    return obj;
  }
}
