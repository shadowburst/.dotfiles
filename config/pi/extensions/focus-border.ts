import {
	CustomEditor,
	type ExtensionAPI,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";

const XTERM_FOCUS_IN = "\x1b[I";
const XTERM_FOCUS_OUT = "\x1b[O";
const ENABLE_XTERM_FOCUS_REPORTING = "\x1b[?1004h";
const DISABLE_XTERM_FOCUS_REPORTING = "\x1b[?1004l";

const KITTY_FOCUS_IN = "\x1bPpi-focus=1\x1b\\";
const KITTY_FOCUS_OUT = "\x1bPpi-focus=0\x1b\\";
const SET_KITTY_FOCUS_AWARE = "\x1b]1337;SetUserVar=PI_FOCUS_AWARE=MQ==\x07";
const CLEAR_KITTY_FOCUS_AWARE = "\x1b]1337;SetUserVar=PI_FOCUS_AWARE\x07";

export default function (pi: ExtensionAPI) {
	let terminalFocused = true;
	let currentEditor: FocusAwareEditor | undefined;

	function hideFakeCursor(line: string): string {
		return line.replace(/\x1b\[7m([\s\S]*?)\x1b\[(?:0|27)m/, "$1");
	}

	class FocusAwareEditor extends CustomEditor {
		private inactiveBorder: (text: string) => string;
		private activeBorder: () => (text: string) => string;

		constructor(
			tui: TUI,
			theme: EditorTheme,
			keybindings: KeybindingsManager,
			inactiveBorder: (text: string) => string,
			activeBorder: () => (text: string) => string,
		) {
			super(tui, theme, keybindings);
			this.inactiveBorder = inactiveBorder;
			this.activeBorder = activeBorder;
		}

		restoreActiveBorder(): void {
			this.borderColor = this.activeBorder();
		}

		applyFocusBorder(): void {
			this.borderColor = terminalFocused ? this.activeBorder() : this.inactiveBorder;
			this.tui.requestRender();
		}

		handleInput(data: string): void {
			let rest = data;

			for (const sequence of [XTERM_FOCUS_OUT, KITTY_FOCUS_OUT]) {
				if (rest.includes(sequence)) {
					terminalFocused = false;
					rest = rest.replaceAll(sequence, "");
					this.applyFocusBorder();
				}
			}

			for (const sequence of [XTERM_FOCUS_IN, KITTY_FOCUS_IN]) {
				if (rest.includes(sequence)) {
					terminalFocused = true;
					rest = rest.replaceAll(sequence, "");
					this.applyFocusBorder();
				}
			}

			if (rest.length > 0) {
				super.handleInput(rest);
			}

			if (!terminalFocused) {
				this.borderColor = this.inactiveBorder;
			}
		}

		render(width: number): string[] {
			if (!terminalFocused) {
				this.borderColor = this.inactiveBorder;
				return super.render(width).map(hideFakeCursor);
			}
			return super.render(width);
		}
	}

	pi.on("session_start", (_event, ctx) => {
		process.stdout.write(ENABLE_XTERM_FOCUS_REPORTING);
		process.stdout.write(SET_KITTY_FOCUS_AWARE);

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			currentEditor = new FocusAwareEditor(
				tui,
				theme,
				keybindings,
				(text) => ctx.ui.theme.fg("border", text),
				() =>
					currentEditor?.getText().trimStart().startsWith("!")
						? ctx.ui.theme.getBashModeBorderColor()
						: ctx.ui.theme.getThinkingBorderColor(pi.getThinkingLevel()),
			);
			currentEditor.applyFocusBorder();
			return currentEditor;
		});
	});

	pi.on("session_shutdown", () => {
		process.stdout.write(CLEAR_KITTY_FOCUS_AWARE);
		process.stdout.write(DISABLE_XTERM_FOCUS_REPORTING);
		currentEditor = undefined;
	});
}
