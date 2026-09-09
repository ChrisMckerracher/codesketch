#!/usr/bin/env node
// Codesketch agent CLI. Dependency-free; delegates to src/cli.

import { main } from "../src/cli/index.mjs";

await main(process.argv.slice(2));
