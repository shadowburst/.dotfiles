_: {
  flake.homeModules.cli =
    { config, lib, ... }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";
      skillsRel = "config/agent-skills";
      cc = config.programs.claude-code;

      mkDotfilesSymlink = path: config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";

      skillNames = lib.attrNames (
        lib.filterAttrs (_: type: type == "directory") (builtins.readDir ../config/agent-skills)
      );

      mkSkillLinks =
        base:
        lib.listToAttrs (
          map (
            name:
            lib.nameValuePair "${base}/${name}" {
              source = mkDotfilesSymlink "${skillsRel}/${name}";
            }
          ) skillNames
        );
    in
    {
      home.file = mkSkillLinks ".agents/skills" // mkSkillLinks "${cc.configDir}/skills";

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
