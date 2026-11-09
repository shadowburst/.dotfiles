_: {
  flake.homeModules.cli =
    {
      config,
      lib,
      pkgs,
      ...
    }:
    let
      cfg = config.textGeneration;
    in
    {
      options.textGeneration = {
        command = lib.mkOption {
          type = with lib.types; nonEmptyListOf str;
          description = ''
            Command for short text generation, such as commit messages, branch
            names and session titles. It reads the prompt on stdin and writes
            only the text on stdout. Override it per host in `homeModules.<host>`.

            Nix code uses `lib.getExe config.textGeneration.package`. Code that is
            not Nix (neovim, pi extensions, scripts) runs `textgen` from PATH.
          '';
        };
        package = lib.mkOption {
          type = lib.types.package;
          readOnly = true;
          description = "The `textgen` wrapper around `command`. Consumers call it by its store path.";
        };
      };

      config = {
        textGeneration.command = lib.mkDefault [
          (lib.getExe config.programs.codex.package)
          "exec"
          "--model"
          "gpt-6-luna"
          "--config"
          "model_reasoning_effort=none"
          # No AGENTS.md: the prompt is the whole task.
          "--config"
          "project_doc_max_bytes=0"
          "--sandbox"
          "read-only"
          "--skip-git-repo-check"
          "--ephemeral"
          "--ignore-user-config"
          "--color"
          "never"
          "-"
        ];
        textGeneration.package = pkgs.writeShellApplication {
          name = "textgen";
          text = "exec ${lib.escapeShellArgs cfg.command}";
        };
        home.packages = [ cfg.package ];
      };
    };
}
