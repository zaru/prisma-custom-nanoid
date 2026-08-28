#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import generatorHelper from "@prisma/generator-helper";
import {
  buildConfiguration,
  renderConfigurationModule,
} from "./generator-output.js";

const { generatorHandler } = generatorHelper;

generatorHandler({
  onManifest() {
    return {
      defaultOutput: "./generated/custom-nanoid",
      prettyName: "Prisma Custom Nano ID Configuration Generator",
    };
  },
  async onGenerate(options) {
    const outputDirectory = options.generator.output?.value;
    if (!outputDirectory) {
      throw new TypeError(
        "prisma-custom-nanoid: the generator output must be specified.",
      );
    }

    const outputPath = path.join(outputDirectory, "index.ts");
    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    const source = renderConfigurationModule(
      buildConfiguration(options.dmmf.datamodel.models),
    );

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(temporaryPath, source, "utf8");
    await rename(temporaryPath, outputPath);
  },
});
