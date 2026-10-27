_: {
  flake.homeModules.cli =
    { config, lib, pkgs, ... }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";
      skillsRel = "config/agent-skills";
      responseStyle = ''
        Reply in ASD-STE100 Simplified Technical English.
      '';
      mkDotfilesSymlink = path: config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
    in
    {
      home.packages = with pkgs; [
        ast-grep
        nodejs
      ];

      programs.claude-code.context = lib.mkAfter responseStyle;
      programs.codex.context = lib.mkAfter responseStyle;
      programs.pi-coding-agent.context = lib.mkAfter responseStyle;

      home.file.".agents/skills".source = mkDotfilesSymlink skillsRel;

      xdg.stateFile."skills/.skill-lock.json".source = mkDotfilesSymlink "${skillsRel}/.skill-lock.json";
    };
}
