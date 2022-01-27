#!/usr/bin/env bash

# This script installs the various packages needed for the complete installation of my environment
#
# Currently this script is only configured for Arch, BTW

# Stop script if any errors are encountered
set -e

# Define global variables
install_log=~/install_progress_log.txt

ask() {
	while true; do
		read -p "$1 (Y/n) " -r
		REPLY=${REPLY:-"y"}
		if [[ $REPLY =~ ^[Yy]$ ]]; then
			return 1
		elif [[ $REPLY =~ ^[Nn]$ ]]; then
			return 0
		else
			log "Type y or n to continue."
		fi
	done
}

install_zsh() {
  git clone https://github.com/jandamm/zgenom.git "${HOME}/.zgenom"
}

install_nvim() {
  [ -d ${XDG_CONFIG_HOME:-$HOME/.config}/nvim ] && mv ${XDG_CONFIG_HOME:-$HOME/.config}/nvim ${XDG_CONFIG_HOME:-$HOME/.config}/nvim.bak
  git clone --depth 1 https://github.com/NTBBloodbath/doom-nvim.git ${XDG_CONFIG_HOME:-$HOME/.config}/nvim
}

setup_gnome_keyring() {
	echo "auth optional pam_gnome_keyring.so" >>/etc/pam.d/login
	echo "session optional pam_gnome_keyring.so auto_start" >>/etc/pam.d/login
	echo "password optional pam_gnome_keyring.so" >>/etc/pam.d/passwd
}

setup_services() {
  sudo systemctl enable --now auto-cpufreq

  systemctl --user daemon-reload
  systemctl --user enable --now rclone@GoogleDrive
  systemctl --user enable --now rclone@GooglePhotos
  systemctl --user enable --now rclone@OneDrive
  systemctl --user enable --now rclone@SchoolDrive
}

setup_ranger() {
  mkdir -p "$HOME/.config/ranger/plugins"
  git clone https://github.com/maximtrp/ranger-archives.git "$HOME/.config/ranger/plugins/ranger-archives"
  git clone https://github.com/alexanderjeurissen/ranger_devicons "$HOME/.config/ranger/plugins/ranger_devicons"
}

setup_crontab() {
  crontab "$HOME/.crontab"
}

setup_lightdm() {
  sudo systemctl enable lightdm
  sudo cp "$HOME/.config/awesome/theme/wallpaper.jpg" /usr/share/backgrounds/
}

setup_user() {
  sudo usermod -aG sys "$USER"
}

pacman=(
  acpilight
  arandr
  autorandr
  base-devel
  bitwarden
  bluez-utils
  calcurse
  discord
  docker
  docker-compose
  exa
  ffmpegthumbnailer
  flameshot
  gamemode
  gimp
  gnome-calculator
  gnome-keyring
  gparted
  gtop
  iptables-nft
  iw
  kdenlive
  kitty
  kvantum-manjaro
  lazygit
  libappindicator-gtk3
  lightdm
  lightdm-gtk-greeter
  lightdm-gtk-greeter-settings
  light-locker
  lutris
  manjaro-settings-samba
  mpc
  mpv
  mugshot
  nvm
  numlockx
  onlyoffice-desktopeditors
  pavucontrol
  polkit-gnome
  playerctl
  prettier
  python-httplib3
  python-oauth2client
  qemu
  qemu-guest-agent
  qt5ct
  ranger
  rclone
  rofi
  seahorse
  shellcheck
  shfmt
  spice-vdagent
  steam-manjaro
  stow
  tela-icon-theme
  thunar
  thunar-volman
  thunar-archive-plugin
  transmission-cli
  ttf-roboto
  unzip
  virt-manager
  xcape
  xclip
  xdotool
  xfce4-settings
  xsane-gimp
  yarn
  yay
  zsh
)
yay=(
  auto-cpufreq
  awesome-git
  bibata-cursor-theme-bin
  brave-bin
  dracula-gtk-theme
  fnm-bin
  howdy
  lazydocker
  lazygit
  light-git
  luacheck
  otf-nerd-fonts-fira-code
  picom-jonaburg-git
  ruby-fusuma
  stylua
  tremc
  visual-studio-code-bin
  youtube-dl-gui
)
