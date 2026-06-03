import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";

type KeybindingsManager = ConstructorParameters<typeof CustomEditor>[2];

const PI_FOCUS_AWARE_VAR = "PI_FOCUS_AWARE";
const KITTY_SET_PI_FOCUS_AWARE = `\x1b]1337;SetUserVar=${PI_FOCUS_AWARE_VAR}=MQ==\x07`;
const KITTY_CLEAR_PI_FOCUS_AWARE = `\x1b]1337;SetUserVar=${PI_FOCUS_AWARE_VAR}\x07`;
const PI_FOCUS_IN = "\x1bPpi-focus=1\x1b\\";
const PI_FOCUS_OUT = "\x1bPpi-focus=0\x1b\\";
const FOCUS_SEQUENCES = [PI_FOCUS_IN, PI_FOCUS_OUT] as const;

function isPartialFocusSequence(text: string): boolean {
	return FOCUS_SEQUENCES.some((sequence) => sequence.startsWith(text));
}

function stripFakeReverseCursor(line: string): string {
	// Pi's editor renders a software cursor using reverse video. When the Kitty
	// hardware cursor is enabled, that software cursor is the white block that
	// remains visible on focus-out and flickers underneath Kitty's own cursor.
	return line.replace(/\x1b\[7m([\s\S]*?)\x1b\[(?:0|27)m/, "$1");
}

class PiKittyEditor extends CustomEditor {
	private kittyFocused = true;
	private pendingFocusInput = "";

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
		super(tui, theme, keybindings, { paddingX: 1 });
	}

	handleInput(data: string): void {
		let input = this.pendingFocusInput + data;
		this.pendingFocusInput = "";
		let handledFocus = false;

		for (;;) {
			const inIndex = input.indexOf(PI_FOCUS_IN);
			const outIndex = input.indexOf(PI_FOCUS_OUT);
			const indexes = [inIndex, outIndex].filter((index) => index >= 0);

			if (indexes.length === 0) {
				break;
			}

			const index = Math.min(...indexes);
			const sequence = input.startsWith(PI_FOCUS_IN, index) ? PI_FOCUS_IN : PI_FOCUS_OUT;
			const before = input.slice(0, index);
			if (before) {
				super.handleInput(before);
			}

			this.kittyFocused = sequence === PI_FOCUS_IN;
			handledFocus = true;
			input = input.slice(index + sequence.length);
		}

		if (input && isPartialFocusSequence(input)) {
			this.pendingFocusInput = input;
			input = "";
		}

		if (input) {
			super.handleInput(input);
		}

		if (handledFocus) {
			this.focused = this.kittyFocused;
			this.tui.requestRender();
		}
	}

	render(width: number): string[] {
		this.focused = this.focused && this.kittyFocused;
		return super.render(width).map(stripFakeReverseCursor);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!process.stdout.isTTY) {
			return;
		}

		process.stdout.write(KITTY_SET_PI_FOCUS_AWARE);
		ctx.ui.setEditorComponent((tui, theme, keybindings) => new PiKittyEditor(tui, theme, keybindings));
	});

	pi.on("session_shutdown", () => {
		if (process.stdout.isTTY) {
			process.stdout.write(KITTY_CLEAR_PI_FOCUS_AWARE);
		}
	});
}
