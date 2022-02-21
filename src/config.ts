export type HfnConfig = [
  // id
  string,
  // towers
  string[],
  // runway
  string,
  // packages
  [
    /* id */ number,
    /* name */ string,
    /* fullName */ string,
    /* schemas */ [
      /* id */ number,
      /* fields */ [
        /* id */ number,
        /* name */ string,
        /* type */ string,
        /* isArray */ number
      ][]
    ][],
    /* modules */ [
      /* id */ number,
      /* name */ string,
      /* models */ [
        /* id */ number,
        /* schemaId */ number,
        /* name */ string
      ][],
      /* hfns */ [/* id */ number, /* schemaId */ number, /* name */ string][]
    ][],
    /* rpcs */ [
      /* id */ number,
      /* name */ string,
      /* request schema id */ number,
      /* response schema id */ number
    ][]
  ][]
];

export enum RunwayTransportType {
  WEBSOCKET = 0,
  POLLING
}

export interface SchemaField {
  id: number;
  name: string;
  type: string;
  isArray: boolean;
}

export interface Schema {
  id: number;
  _id: string;
  fields: Record<string, SchemaField>;
}

export interface Package {
  id: number;
  name: string;
  fullName?: string;
  modules: Record<string, Module>;
  rpcs: Record<string, Rpc>;
}

export interface Model {
  id: number;
  name: string;
  schema: Schema;
}

export interface HyperFunction {
  id: number;
  name: string;
  shcema: Schema;
  module: Module;
}

export interface Rpc {
  id: number;
  name: string;
  reqSchema: Schema;
  resSchema: Schema;
  pkg: Package;
}

export interface Module {
  id: number;
  name: string;
  models: Record<string, Model>;
  hfns: Record<string, HyperFunction>;
  pkg: Package;
}

export class Config {
  id: string;
  towers: string[];
  runway: string;
  packages: Record<string, Package> = {};
  schemas: Record<string, Schema> = {};
  hfns: Record<string, HyperFunction> = {};
  models: Record<string, Model> = {};
  rpcs: Record<string, Rpc> = {};
  constructor(public hfnConfig: HfnConfig) {
    this.id = hfnConfig[0];
    this.towers = hfnConfig[1];
    this.runway = hfnConfig[2];

    if (!this.runway && !this.towers.length) {
      throw new Error("miss url");
    }

    hfnConfig[3].forEach(hfnPackage => {
      const pkg: Package = {
        id: hfnPackage[0],
        name: hfnPackage[1],
        fullName: hfnPackage[2],
        modules: {},
        rpcs: {}
      };

      this.packages[pkg.id] = this.packages[pkg.name] = pkg;
      if (pkg.fullName) this.packages[pkg.fullName] = pkg;

      hfnPackage[3].forEach(hfnSchema => {
        const schema: Schema = {
          id: hfnSchema[0],
          _id: `${pkg.id}-${hfnSchema[0]}`,
          fields: {}
        };

        hfnSchema[1].forEach(hfnField => {
          const field: SchemaField = {
            id: hfnField[0],
            name: hfnField[1],
            type: hfnField[2],
            isArray: !!hfnField[3]
          };

          schema.fields[field.id] = schema.fields[field.name] = field;
        });

        this.schemas[`${pkg.id}-${schema.id}`] = schema;
      });

      hfnPackage[4].forEach(hfnModule => {
        const mod: Module = {
          id: hfnModule[0],
          name: hfnModule[1],
          models: {},
          hfns: {},
          pkg
        };

        hfnModule[2].forEach(hfnModel => {
          const model: Model = {
            id: hfnModel[0],
            name: hfnModel[2],
            schema: this.schemas[`${pkg.id}-${hfnModel[1]}`]
          };

          this.models[
            `${pkg.id === 0 ? "" : pkg.name + "."}${mod.name}.${
              model.name || "State"
            }`
          ] = mod.models[model.id] = mod.models[model.name] = model;
        });

        hfnModule[3].forEach(item => {
          const hfn: HyperFunction = {
            id: item[0],
            name: item[2],
            shcema: this.schemas[`${pkg.id}-${item[1]}`],
            module: mod
          };

          this.hfns[
            `${pkg.id === 0 ? "" : pkg.name + "."}${mod.name}.${hfn.name}`
          ] = mod.hfns[hfn.id] = mod.hfns[hfn.name] = hfn;
        });

        pkg.modules[mod.id] = pkg.modules[mod.name] = mod;
      });

      hfnPackage[5].forEach(hfnRpc => {
        const rpc: Rpc = {
          id: hfnRpc[0],
          name: hfnRpc[1],
          pkg,
          reqSchema: this.schemas[`${pkg.id}-${hfnRpc[2]}`],
          resSchema: this.schemas[`${pkg.id}-${hfnRpc[3]}`]
        };

        this.rpcs[`${pkg.id === 0 ? "" : pkg.name + "."}${rpc.name}`] =
          this.rpcs[`${pkg.id}-${rpc.id}`] =
          pkg.rpcs[rpc.id] =
          pkg.rpcs[rpc.name] =
            rpc;
      });
    });
  }
}
