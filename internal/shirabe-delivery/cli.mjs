#!/usr/bin/env node
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { calculateRoi, createPackage, deletionRehearsal, readJson, restorePackage, scaffold, validateEngagement, verifyPackage, writeJson } from "./lib.mjs";

const [command, ...args] = process.argv.slice(2);
let result;
try {
  if (command === "scaffold") {
    const [directory, id] = args;
    if (!directory || !id) throw new Error("usage: scaffold <directory> <engagement-id>");
    await mkdir(directory, { recursive: true });
    await writeJson(path.join(directory, "engagement.json"), scaffold(id));
    result = { passed: true, file: path.join(directory, "engagement.json") };
  } else if (command === "validate") {
    result = validateEngagement(await readJson(args[0]));
  } else if (command === "roi") {
    result = calculateRoi((await readJson(args[0])).roi);
  } else if (command === "package") {
    result = await createPackage(args[0], args[1]);
  } else if (command === "verify") {
    result = await verifyPackage(args[0]);
  } else if (command === "restore") {
    result = await restorePackage(args[0], args[1]);
  } else if (command === "delete-rehearsal") {
    result = await deletionRehearsal(args[0], args[1], args[2]);
  } else {
    throw new Error("commands: scaffold, validate, roi, package, verify, restore, delete-rehearsal");
  }
  console.log(JSON.stringify(result, null, 2));
  if (result?.passed === false) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ passed: false, error: error.message }, null, 2));
  process.exitCode = 1;
}

