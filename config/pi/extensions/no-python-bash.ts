import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PYTHON_COMMAND_RE = /(?:^|[;&|()\n]\s*)(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(?:(?:env|command|time|sudo)\s+)*(?:python|python3)(?:\s|$)/;

function callsUnavailablePython(command: string): boolean {
	return PYTHON_COMMAND_RE.test(command);
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => ({
		systemPrompt: `${event.systemPrompt}\n\n# Runtime guard\nThe bash environment does not provide Python. Never call \`python\` or \`python3\`; use shell/coreutils/awk/jq/perl/node or pi file tools instead.`,
	}));

	pi.on("tool_call", async (event) => {
		if (!isToolCallEventType("bash", event) || !callsUnavailablePython(event.input.command)) {
			return;
		}

		return {
			block: true,
			reason: "Blocked: this environment does not provide python/python3. Rewrite the command using shell, coreutils, awk, jq, perl, node, or pi's read/edit tools.",
		};
	});
}
