_: {
  flake.homeModules.cli =
    { config, ... }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";
      skillsRel = "config/agent-skills";
      mkDotfilesSymlink = path: config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
    in
    {
      home.file.".agents/skills".source = mkDotfilesSymlink skillsRel;

      xdg.stateFile."skills/.skill-lock.json".source = mkDotfilesSymlink "${skillsRel}/.skill-lock.json";

      programs.mcp = {
        enable = true;
        servers.chrome-devtools = {
          command = "npx";
          args = [
            "-y"
            "chrome-devtools-mcp@latest"
            "--isolated"
            "--executablePath=${config.programs.brave.package}/bin/brave"
          ];
        };
      };
    };
}
