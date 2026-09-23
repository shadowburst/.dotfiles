_: {
  flake.homeModules.cli =
    { config, pkgs, ... }:
    let
      dotfilesDir = "${config.home.homeDirectory}/.dotfiles";
      skillsRel = "config/agent-skills";
      mkDotfilesSymlink = path: config.lib.file.mkOutOfStoreSymlink "${dotfilesDir}/${path}";
    in
    {
      home.packages = with pkgs; [
        ast-grep
      ];

      home.file.".agents/skills".source = mkDotfilesSymlink skillsRel;

      xdg.stateFile."skills/.skill-lock.json".source = mkDotfilesSymlink "${skillsRel}/.skill-lock.json";
    };
}
