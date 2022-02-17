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
  idWithPid: string;
  fields: SchemaField[];
  fieldMap: Record<string, SchemaField>;
}

export interface Package {
  id: number;
  name: string;
  fullName?: string;
  modules: Module[];
  moduleMap: Record<string, Module>;
  hfnMap: Record<string, HyperFunction>;
  modelMap: Record<string, Model>;
  schemaMap: Record<string, Schema>;
  rpcs: Rpc[];
  rpcMap: Record<string, Rpc>;
}

export interface Model {
  id: number;
  name: string;
  module: Module;
  schema: Schema;
}

export interface HyperFunction {
  id: number;
  name: string;
  module: Module;
  shcema: Schema;
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
  models: Model[];
  modelMap: Record<string, Model>;
  hfns: HyperFunction[];
  hfnMap: Record<string, HyperFunction>;
  pkg: Package;
}

export class Config {
  id: string;
  towers: string[];
  runway: string;
  packages: Package[] = [];
  packageMap: Record<string, Package> = {};
  schemaMap: Record<string, Schema> = {};
  hfnMap: Record<string, HyperFunction> = {};
  modelMap: Record<string, Model> = {};
  rpcMap: Record<string, Rpc> = {};
  constructor(public hfnConfig: HfnConfig) {
    this.id = hfnConfig[0];
    this.towers = hfnConfig[1];
    this.runway = hfnConfig[2];

    if (!this.runway && !this.towers.length) {
      throw new Error("Tower or Runway is required");
    }

    const hfnPackages = hfnConfig[3];
    hfnPackages.forEach(hfnPackage => {
      const pkg: Package = {
        id: hfnPackage[0],
        name: hfnPackage[1],
        fullName: hfnPackage[2],
        modules: [],
        moduleMap: {},
        hfnMap: {},
        modelMap: {},
        schemaMap: {},
        rpcs: [],
        rpcMap: {}
      };

      this.packages.push(pkg);
      this.packageMap[pkg.id] = this.packageMap[pkg.name] = pkg;
      if (pkg.fullName) this.packageMap[pkg.fullName] = pkg;

      const hfnSchemas = hfnPackage[3] || [];
      hfnSchemas.forEach(hfnSchema => {
        const schema: Schema = {
          id: hfnSchema[0],
          idWithPid: `${pkg.id}-${hfnSchema[0]}`,
          fields: [],
          fieldMap: {}
        };

        pkg.schemaMap[schema.id] = this.schemaMap[schema.idWithPid] = schema;

        const hfnFields = hfnSchema[1] || [];
        hfnFields.forEach(hfnField => {
          const field: SchemaField = {
            id: hfnField[0],
            name: hfnField[1],
            type: hfnField[2],
            isArray: !!hfnField[3]
          };

          schema.fields.push(field);
          schema.fieldMap[field.id] = schema.fieldMap[field.name] = field;
        });
      });

      const hfnModules = hfnPackage[4] || [];
      hfnModules.forEach(hfnModule => {
        const mod: Module = {
          id: hfnModule[0],
          name: hfnModule[1],
          models: [],
          modelMap: {},
          hfns: [],
          hfnMap: {},
          pkg
        };

        const hfnModels = hfnModule[2] || [];
        hfnModels.forEach(hfnModel => {
          const model: Model = {
            id: hfnModel[0],
            name: hfnModel[2],
            module: mod,
            schema: pkg.schemaMap[hfnModel[1]]
          };

          mod.models.push(model);
          mod.modelMap[model.id] = mod.modelMap[model.name] = model;
          pkg.modelMap[`${mod.name}.${model.name || "State"}`] = model;
          this.modelMap[
            `${pkg.id === 0 ? "" : pkg.name + "."}${mod.name}.${
              model.name || "State"
            }`
          ] = model;
        });

        const hfnHfns = hfnModule[3] || [];
        hfnHfns.forEach(item => {
          const hfn: HyperFunction = {
            id: item[0],
            name: item[2],
            module: mod,
            shcema: pkg.schemaMap[item[1]]
          };

          mod.hfns.push(hfn);
          mod.hfnMap[hfn.id] = mod.hfnMap[hfn.name] = hfn;
          pkg.hfnMap[`${mod.name}.${hfn.name}`] = hfn;
          this.hfnMap[
            `${pkg.id === 0 ? "" : pkg.name + "."}${mod.name}.${hfn.name}`
          ] = hfn;
        });

        pkg.modules.push(mod);
        pkg.moduleMap[mod.id] = pkg.moduleMap[mod.name] = mod;
      });

      const hfnRpcs = hfnPackage[5] || [];
      hfnRpcs.forEach(hfnRpc => {
        const rpc: Rpc = {
          id: hfnRpc[0],
          name: hfnRpc[1],
          reqSchema: pkg.schemaMap[hfnRpc[2]],
          resSchema: pkg.schemaMap[hfnRpc[3]],
          pkg
        };

        pkg.rpcs.push(rpc);
        pkg.rpcMap[rpc.id] = pkg.rpcMap[rpc.name] = rpc;
        this.rpcMap[`${pkg.id === 0 ? "" : pkg.name + "."}${rpc.name}`] = rpc;
      });
    });
  }
}
