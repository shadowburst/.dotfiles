{
  pkgs,
  stateVersion,
  username,
  ...
}: {
  imports = [
    ./catppuccin.nix
    ./disks.nix
    ./keyboard.nix
    ./networking.nix
    ./ssh.nix
    ./virtualisation.nix
  ];

  users.users.${username} = {
    isNormalUser = true;
    description = "Peter Baudry";
    extraGroups = [
      "input"
      "video"
      "wheel"
    ];
    shell = pkgs.fish;
    createHome = true;
  };

  programs.fish.enable = true;

  time.timeZone = "Europe/Paris";
  i18n = {
    defaultLocale = "en_GB.UTF-8";
    extraLocaleSettings = {
      LC_ADDRESS = "en_GB.UTF-8";
      LC_IDENTIFICATION = "en_GB.UTF-8";
      LC_MEASUREMENT = "en_GB.UTF-8";
      LC_MONETARY = "en_GB.UTF-8";
      LC_NAME = "en_GB.UTF-8";
      LC_NUMERIC = "en_GB.UTF-8";
      LC_PAPER = "en_GB.UTF-8";
      LC_TELEPHONE = "en_GB.UTF-8";
      LC_TIME = "en_GB.UTF-8";
    };
  };

  security.rtkit.enable = true;

  nixpkgs.config.allowUnfree = true;
  nix = {
    gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 7d";
    };
    settings = {
      auto-optimise-store = true;
      experimental-features = [
        "nix-command"
        "flakes"
      ];
    };
  };

  system = {
    inherit stateVersion;
  };
}
