{ config, pkgs, ... }:

{
  imports =
    [
      ./hardware-configuration.nix
    ];

  # Bootloader.
  boot = {
    kernelPackages = pkgs.linuxPackages_latest;

    loader = {
      grub = {
        enable = true;
        device = "/dev/sda";
        efiSupport = true;
        useOSProber = true;
        configurationLimit = 5;
      };

      timeout = 1;
    };
  };

  hardware = {
    cpu.intel.updateMicrocode = true;
    enableRedistributableFirmware = true;
    opengl = {
      enable = true;
      driSupport = true;
      driSupport32Bit = true;
      extraPackages = with pkgs; [
        intel-media-driver
        libvdpau-va-gl
        vaapiVdpau
      ];
    };
  };

  networking = {
    firewall = {
      enable = true;
      allowedUDPPorts = [
        20595 # Casting
      ];
    };
    hostName = "xps";

    networkmanager.enable = true;
  };

  security = {
    rtkit.enable = true;
    pam.services = {
      greetd.enableGnomeKeyring = true;
    };
    polkit.enable = true;
  };

  sound = {
    enable = true;
    mediaKeys.enable = true;
  };

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

  # Configure console keymap
  console.keyMap = "fr";

  fonts = {
    enableDefaultFonts = true;
    fonts = with pkgs; [
      corefonts
      noto-fonts
      noto-fonts-emoji
      (nerdfonts.override {
        fonts = [ "JetBrainsMono" ];
      })
    ];
    fontconfig.defaultFonts = {
      serif = [ "Noto Sans" ];
      sansSerif = [ "Noto Sans" ];
      monospace = [ "Noto Sans Mono" ];
    };
  };

  environment.variables = {
    VDPAU_DRIVER = "va_gl";
    LIBVA_DRIVER_NAME = "iHD";

    TERMINAL = "kitty";
    BROWSER = "brave";
    EDITOR = "nvim";
    MANPAGER = "nvim +Man!";
  };

  # Define a user account. Don't forget to set a password with ‘passwd’.
  users.users.pbaudry = {
    isNormalUser = true;
    description = "pbaudry";
    extraGroups = [ "kvm" "libvirtd" "lp" "networkmanager" "wheel" ];
    shell = pkgs.fish;
  };

  # List packages installed in system profile. To search, run:
  # $ nix search wget
  environment.systemPackages = with pkgs; [
    acpilight
    brave
    cargo
    cava
    curl
    discord
    docker
    dunst
    eww-wayland
    exa
    filelight
    firefox
    fuzzel
    fzf
    gamemode
    gcc
    gimp
    git
    gparted
    gnome.gnome-calculator
    gnome.seahorse
    gnumake
    htop
    iw
    jq
    kdenlive
    kitty
    lazydocker
    lf
    light
    lutris
    mpv
    neovim
    nodejs
    nodePackages.npm
    pavucontrol
    pciutils
    playerctl
    polkit_gnome
    ripgrep
    socat
    starship
    stow
    sway-contrib.grimshot
    swaybg
    swayidle
    swayimg
    swaylock-effects
    tmux
    trash-cli
    transmission
    unzip
    wdisplays
    wget
    wl-clipboard
    wlogout
    xdg-utils
    xfce.thunar
    xfce.thunar-volman
  ];

  # List services that you want to enable:
  services = {
    avahi = {
      enable = true;
      nssmdns = true;
      publish = {
        enable = true;
        addresses = true;
        userServices = true;
      };
    };
    auto-cpufreq.enable = true;
    blueman.enable = true;
    dbus.enable = true;
    fstrim.enable = true;
    greetd = {
      enable = true;
      settings = {
        default_session = {
          command = "${pkgs.greetd.tuigreet}/bin/tuigreet --time --time-format '%A %e, %B %Y' --remember --asterisks --cmd Hyprland";
        };
      };
    };
    openssh = {
      enable = true;
      allowSFTP = true;
    };
    pipewire = {
      enable = true;
      pulse.enable = true;
      alsa = {
        enable = true;
        support32Bit = true;
      };
    };
    printing.enable = true;
    tlp.enable = true;
    xserver = {
      layout = "fr";
      xkbVariant = "azerty";
    };
  };

  programs = {
    fish.enable = true;
    hyprland.enable = true;
    steam.enable = true;
  };

  xdg.portal = {
    enable = true;
    wlr.enable = true;
    # extraPortals = with pkgs; [ xdg-desktop-portal-hyprland ];
  };

  virtualisation = {
    docker.enable = true;
  };

  nix = {
    gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 7d";
    };
    settings = {
      auto-optimise-store = true;
    };
  };

  nixpkgs.config.allowUnfree = true;

  system.stateVersion = "23.05";
}
