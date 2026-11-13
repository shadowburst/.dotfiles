{ pkgs }:
let
  inherit (pkgs) lib;
  helper = pkgs.writeScript "herdr-resume" ''
    #!${pkgs.python3}/bin/python3
    ${builtins.readFile ./resume.py}
  '';
in
pkgs.runCommand "herdr-resume" { } ''
  mkdir -p "$out/bin" "$out/libexec" "$out/opencode"
  install -m755 ${helper} "$out/bin/herdr-resume"
  cp ${./resume.py} "$out/libexec/resume.py"
  cp ${./opencode/tui.js} "$out/opencode/tui.js"
  cp ${./opencode/package.json} "$out/opencode/package.json"
  substituteInPlace "$out/opencode/tui.js" --replace-fail '@helper@' "$out/bin/herdr-resume"
  ${lib.concatMapStringsSep "\n"
    (agent: ''
      mkdir -p "$out/${agent}/.claude-plugin" "$out/${agent}/hooks"
      cat > "$out/${agent}/.claude-plugin/plugin.json" <<'JSON'
      ${builtins.toJSON {
        name = "herdr-resume";
        version = "1.0.0";
        description = "Save the active conversation for Herdr recovery.";
        hooks = [ "./hooks/hooks.json" ];
      }}
      JSON
      cat > "$out/${agent}/hooks/hooks.json" <<JSON
      ${builtins.toJSON {
        hooks = lib.genAttrs [ "SessionStart" "SessionEnd" ] (_: [
          {
            hooks = [
              {
                type = "command";
                command = "$out/bin/herdr-resume ${agent}";
                timeout = 3;
              }
            ];
          }
        ]);
      }}
      JSON
    '')
    [
      "claude"
      "codex"
    ]
  }
  cp ${./test_resume.py} "$out/libexec/test_resume.py"
  PYTHONDONTWRITEBYTECODE=1 ${pkgs.python3}/bin/python3 "$out/libexec/test_resume.py"
  cp ${./opencode/test.mjs} "$out/opencode/test.mjs"
  ${pkgs.nodejs}/bin/node --experimental-vm-modules --test "$out/opencode/test.mjs"
''
