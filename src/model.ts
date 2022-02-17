import { encode, decode } from "./msgpack";
import { Config, Schema } from "./config";

function processType(value: any, type: string) {
  if (type === "s") {
    return typeof value === "string" ? value : String(value);
  }

  if (type === "i") {
    value = typeof value === "number" ? value : parseInt(value, 10);
    value = value % 1 === 0 ? value : Math.floor(value);

    if (isNaN(value)) value = 0;
    if (value > 2147483647) value = 2147483647;
    if (value < -2147483648) value = -2147483648;

    return value;
  }

  if (type === "f") {
    value = parseFloat(value);
    if (isNaN(value)) value = 0;

    return parseFloat(value);
  }

  if (type === "b") {
    return typeof value === "boolean" ? value : Boolean(value);
  }

  if (type === "t") {
    return value instanceof Uint8Array ? value : new Uint8Array([]);
  }
}

export default class Model {
  private data: Record<string, any>;
  constructor(public appConfig: Config, public schema: Schema) {
    this.data = Object.create(null);
  }

  set(key: string, value: any) {
    if (typeof value === "undefined") return false;
    const field = this.schema.fieldMap[key];
    if (!field) return false;

    const isArray = Array.isArray(value);
    if (field.isArray && !isArray) return false;

    if (field.type.length === 1) {
      // scalar type
      if (isArray) {
        for (let i = 0; i < value.length; i++) {
          value[i] = processType(value[i], field.type);
        }
      } else {
        value = processType(value, field.type);
      }
    } else {
      // model type
      const targetSchema = this.appConfig.schemaMap[field.type];
      if (!targetSchema) return false;
      if (isArray) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (!(item instanceof Model) || item.schema.idWithPid !== field.type)
            return false;
        }
      } else {
        if (!(value instanceof Model) || value.schema.idWithPid !== field.type)
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
      const field = this.schema.fieldMap[key];
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
    if (!data.byteLength) return;
    let dataArr = [];
    try {
      dataArr = decode(data, true);
    } catch (error) {
      console.log(error);
      return;
    }

    let field = null;
    for (let i = 0; i < dataArr.length; i++) {
      const item = dataArr[i];
      if (!field) {
        field = this.schema.fieldMap[item];
        if (!field) return;
        continue;
      }

      let value;
      if (field.type.length === 1) {
        value = item;
      } else {
        const targetSchema = this.appConfig.schemaMap[field.type];
        if (!targetSchema) return;
        if (field.isArray) {
          value = item.map((data: Uint8Array) => {
            const m = new Model(this.appConfig, targetSchema);
            m.decode(data);
            return m;
          });
        } else {
          value = new Model(this.appConfig, targetSchema);
          value.decode(item);
        }
      }

      this.set(field.name, value);
      field = null;
    }
  }
  fromObject(obj: any) {
    if (typeof obj !== "object") return null;
    Object.keys(obj).forEach(key => {
      const field = this.schema.fieldMap[key];
      if (!field) return null;
      if (field.type.length === 1) {
        this.set(key, obj[key]);
      } else {
        if (field.isArray) {
          this.set(
            key,
            obj[key].map((item: any) => {
              const m = new Model(
                this.appConfig,
                this.appConfig.schemaMap[field.type]
              );
              m.fromObject(item);
              return m;
            })
          );
        } else {
          const m = new Model(
            this.appConfig,
            this.appConfig.schemaMap[field.type]
          );
          m.fromObject(obj[key]);
          this.set(key, m);
        }
      }
    });
    return this;
  }
  toObject() {
    const obj: Record<string, any> = {};
    this.keys().forEach(key => {
      const field = this.schema.fieldMap[key];
      if (!field) return;
      if (field.type.length === 1) {
        obj[key] = this.get(key);
      } else {
        if (field.isArray) {
          obj[key] = this.get(key).map((item: Model) => item.toObject());
        } else {
          obj[key] = this.get(key).toObject();
        }
      }
    });
    return obj;
  }
}
