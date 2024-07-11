#!/usr/bin/env bash

# ██████╗░░█████╗░████████╗███████╗██╗██╗░░░░░███████╗░██████╗
# ██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║██║░░░░░██╔════╝██╔════╝
# ██║░░██║██║░░██║░░░██║░░░█████╗░░██║██║░░░░░█████╗░░╚█████╗░
# ██║░░██║██║░░██║░░░██║░░░██╔══╝░░██║██║░░░░░██╔══╝░░░╚═══██╗
# ██████╔╝╚█████╔╝░░░██║░░░██║░░░░░██║███████╗███████╗██████╔╝
# ╚═════╝░░╚════╝░░░░╚═╝░░░╚═╝░░░░░╚═╝╚══════╝╚══════╝╚═════╝░

# This script installs and sets up all the packages that I use
# Currently this script is only configured for Arch, BTW

# Stop script if any errors are encountered
set -e

automatic=false

ask() {
  if $automatic; then
    return 0
  fi

  while true; do
    read -rp "$1 (Y/n) "
    REPLY=${REPLY:-"y"}
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      return 0
    elif [[ $REPLY =~ ^[Nn]$ ]]; then
      return 1
    else
      printf "Type y or n to continue.\n\n"
    fi
  done
}

if ask "Automatic install ?"; then
  automatic=true
fi

if ask "Update packages ?"; then
  sudo pacman -Syyu
fi

if ! command -v paru; then
  sudo pacman -S --needed base-devel
  git clone https://aur.archlinux.org/paru.git
  makepkg -si --directory=./paru
  rm -rf ./paru
fi

if ! command -v stow; then
  paru --needed --noconfirm -S stow
  paru --needed --noconfirm -S - <./packages
  paru --needed --noconfirm -S - <./packages-aur
fi

if ask "Install Arch configs ?"; then
  stow arch

  sudo systemctl enable --now bluetooth
  sudo systemctl enable --now cronie
  sudo systemctl enable --now reflector.timer

  sudo virsh net-autostart default
  sudo gpasswd -a "$USER" libvirt
  sudo systemctl enable --now libvirtd
fi

if ask "Installing on a laptop ?"; then
  sudo gpasswd -a "$USER" input

  sudo systemctl enable --now auto-cpufreq
  sudo systemctl enable --now sshd
fi

if ask "Install desktop ?"; then
  stow desktop

  # Setup gnome keyring
  echo "auth optional pam_gnome_keyring.so" | sudo tee -a /etc/pam.d/login
  echo "session optional pam_gnome_keyring.so auto_start" | sudo tee -a /etc/pam.d/login
  echo "password optional pam_gnome_keyring.so" | sudo tee -a /etc/pam.d/passwd
  systemctl --user enable --now gcr-ssh-agent.service

  # Setup greetd
  sudo systemctl enable greetd.service
  sudo sed -i "s#command = .*#command = \"tuigreet --time --time-format '%A %e, %B %Y' --remember --asterisks --cmd Hyprland\"#" /etc/greetd/config.toml
  echo "auth optional pam_gnome_keyring.so" | sudo tee -a /etc/pam.d/greetd
  echo "session optional pam_gnome_keyring.so auto_start" | sudo tee -a /etc/pam.d/greetd

  # Set up pipewire
  systemctl --user enable --now pipewire.service
  systemctl --user enable --now pipewire-pulse.service

  # Open ports for casting
  # firewall-cmd --zone=public --permanent --add-port=8008/tcp
  # firewall-cmd --zone=public --permanent --add-port=8009/tcp

  # GTK
  dconf write /org/gnome/desktop/interface/icon-theme "'kora'"
  dconf write /org/gnome/desktop/interface/color-scheme "'prefer-dark'"
  dconf write /org/gnome/desktop/interface/cursor-theme "'Bibata-Modern-Classic'"
  dconf write /org/gnome/desktop/interface/gtk-theme "'Catppuccin-Macchiato-Standard-Blue-Dark'"

  # Install GTK theme
  if [[ ! -d "$HOME/.themes/Catppuccin-Macchiato-Standard-Blue-Dark" ]]; then
    wget https://github.com/catppuccin/gtk/releases/download/v0.7.0/Catppuccin-Macchiato-Standard-Blue-Dark.zip
    unzip ./Catppuccin-Macchiato-Standard-Blue-Dark.zip -d ~/.themes
    rm -f ./Catppuccin-Macchiato-Standard-Blue-Dark.zip
  fi

  # Install cursor
  if [[ ! -d "$HOME/.local/share/icons/Bibata-Modern-Classic" ]]; then
    wget https://github.com/ful1e5/Bibata_Cursor/releases/download/v2.0.4/Bibata-Modern-Classic.tar.xz
    tar xf ./Bibata-Modern-Classic.tar.xz --directory="$HOME/.local/share/icons/"
    rm -f ./Bibata-Modern-Classic.tar.xz
  fi

fi

if ask "Install terminal ?"; then
  stow terminal

  chsh -s "$(which fish)"

  sudo gpasswd -a "$USER" docker
  sudo systemctl enable --now docker.service
fi

if ask "Install intel graphics controller ?"; then
  sudo pacman -S intel-media-driver vulkan-intel libvdpau-va-gl lib32-vulkan-intel
  echo "VDPAU_DRIVER=va_gl" | sudo tee -a /etc/environment
  echo "LIBVA_DRIVER_NAME=iHD" | sudo tee -a /etc/environment
fi

if ask "Install printer ?"; then
  paru -S brother-dcpj785dw simple-scan brscan4

  sudo systemctl enable --now cups
  read -rp "Enter the IP address of the printer : "
  sudo brsaneconfig4 -a name="Brother" model=DCP-J785DW ip="${REPLY}"
  sudo lpadmin -p Brother -E -L Home -m "Brother DCP-J785DW CUPS" -v lpd://BRW5CEA1D16F8C5/BINARY_P1
fi
