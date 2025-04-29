{
  pkgs,
  config,
  ...
}: {
  home.packages = with pkgs; [
    ashell
  ];
  xdg.configFile."ashell.yml".source = (pkgs.formats.yaml {}).generate "ashell" {
    outputs = "All";
    position = "Top";
    modules = {
      left = [["Workspaces" "WindowTitle"]];
      center = ["MediaPlayer"];
      right = [["SystemInfo" "Clock" "Privacy" "Settings"]];
    };
    settings = {
      lockCmd = "hyprlock &";
      audioSinksMoreCmd = "pavucontrol -t 3";
      audioSourcesMoreCmd = "pavucontrol -t 4";
      wifiMoreCmd = "${config.home.sessionVariables.TERMINAL} -e nmtui";
      bluetoothMoreCmd = "blueman-manager";
    };
    appearance = with config.lib.stylix.colors.withHashtag; {
      fontName = "Noto sans";
      backgroundColor = base00;
      textColor = base05;
      primaryColor = base0D;
      secondaryColor = base01;
      successColor = base07;
      dangerColor = base08;
      workspaceColors = [base0D];
    };
  };
  # xdg.configFile."ashell/config.toml".source = (pkgs.formats.toml {}).generate "ashell" {
  #   logLevel = "debug";
  #   outputs = "all";
  #   position = "top";
  #   appLauncherCmd = "";
  #   modules = {
  #     left = ["workspaces" "windowTitle"];
  #     center = ["mediaPlayer"];
  #     right = ["systemInfo" ["clock" "privacy" "settings"]];
  #   };
  #   workspaces = {
  #     enableWorkspaceFilling = true;
  #   };
  #   settings = {
  #     lockCmd = "hyprlock &";
  #     audioSinksMoreCmd = "pavucontrol -t 3";
  #     audioSourcesMoreCmd = "pavucontrol -t 4";
  #     wifiMoreCmd = "${config.home.sessionVariables.TERMINAL} -e nmtui";
  #     bluetoothMoreCmd = "blueman-manager";
  #   };
  #   appearance = with config.lib.stylix.colors.withHashtag; {
  #     fontName = "Noto sans";
  #     backgroundColor = base00;
  #     textColor = base05;
  #     primaryColor = base0D;
  #     secondaryColor = base03;
  #     successColor = base06;
  #     dangerColor = base08;
  #   };
  # };
}
