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

if ask "Install official packages ?"; then
	sudo pacman --needed --ask 4 -S - <./packages
fi

if ask "Install aur packages ?"; then
	paru --needed --ask 4 -S - <./packages-aur
fi

if ask "Install Arch configs ?"; then
	stow arch

	sudo systemctl enable --now bluetooth
	sudo systemctl enable --now cronie
	sudo systemctl enable --now reflector.timer

	# Load cron jobs
	crontab ".crontab"
fi

if ask "Installing on a laptop ?"; then
	sudo gpasswd -a "$USER" input libvirt

	sudo systemctl enable --now auto-cpufreq
	sudo systemctl enable --now autorandr
	sudo systemctl enable --now libvirtd
fi

if ask "Install desktop ?"; then
	stow desktop

	# Setup gnome keyring
	echo "auth optional pam_gnome_keyring.so" | sudo tee -a /etc/pam.d/login
	echo "session optional pam_gnome_keyring.so auto_start" | sudo tee -a /etc/pam.d/login
	echo "password optional pam_gnome_keyring.so" | sudo tee -a /etc/pam.d/passwd

	# Enable dark mode for gnome apps
	gsettings set org.gnome.desktop.interface color-scheme prefer-dark
fi

if ask "Install editors ?"; then
	stow editors

	# Setup emacs
	git clone --depth 1 https://github.com/doomemacs/doomemacs ~/.emacs.d
	~/.emacs.d/bin/doom install
fi

if ask "Install programs ?"; then
	stow programs
fi

if ask "Install shells ?"; then
	stow shells

	# Setup ZSH
	git clone https://github.com/jandamm/zgenom.git ~/.zgenom
	chsh -s "$(which zsh)"
fi

if ask "Install graphics controller ?"; then
	vga_controller=$(lspci | grep -i --color 'vga\|3d\|2d')
	if [ -n "$(echo "$vga_controller" | grep -q "Intel")" ]; then
		sudo pacman -S intel-media-driver vulkan-intel libvdpau-va-gl
		echo "VDPAU_DRIVER=va_gl" | sudo tee -a /etc/environment
		echo "LIBVA_DRIVER_NAME=iHD" | sudo tee -a /etc/environment
	fi
fi

if ask "Install printer ?"; then
	paru -S brother-dcpj785dw simple-scan brscan4

	sudo systemctl enable --now cups
	read -rp "Enter the IP address of the printer : "
	sudo brsaneconfig4 -a name="Brother" model=DCP-J785DW ip="${REPLY}"
fi
