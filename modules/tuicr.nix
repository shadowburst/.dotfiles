_: {
  flake.homeModules.cli =
    { pkgs, ... }:
    let
      tomlFormat = pkgs.formats.toml { };
    in
    {
      home.packages = [ pkgs.tuicr ];

      xdg.configFile."tuicr/config.toml".source = tomlFormat.generate "tuicr-config.toml" {
        theme = "catppuccin-mocha";
        diff_view = "side-by-side";
        ignore_whitespace = false;
        leader = ";";
        comment_vim = true;
        relative_line_numbers = true;
      };
    };
}
