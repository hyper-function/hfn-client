import { defineConfig } from "rollup";
import ts from "@rollup/plugin-typescript";
import cjs from "@rollup/plugin-commonjs";
import dts from "rollup-plugin-dts";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import { terser } from "rollup-plugin-terser";
import cleanup from "rollup-plugin-cleanup";
import license from "rollup-plugin-license";
import pkgJson from "./package.json";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig([
  {
    input: "src/client.ts",
    output: {
      file: "./dist/index.js",
      format: "esm"
    },
    plugins: [
      ts(),
      cjs(),
      nodeResolve(),
      replace({
        "process.env.VERSION": JSON.stringify(pkgJson.version),
        preventAssignment: false
      }),
      isProduction && terser(),
      // license({
      //   banner: {
      //     commentStyle: "regular", // The default
      //     content: ""
      //   }
      // }),
      cleanup({
        comments: "none"
      })
    ]
  },
  {
    input: "./tmp/dts/client.d.ts",
    output: [{ file: "dist/index.d.ts", format: "es" }],
    plugins: [dts()]
  }
]);
