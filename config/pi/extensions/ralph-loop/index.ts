import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerRalphCommands } from "./src/extension.mjs";

export default function (pi: ExtensionAPI) {
  registerRalphCommands(pi);
}
