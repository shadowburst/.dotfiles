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
	sudo pacman --needed --ask 4 -Sy - <./packages
fi

if ask "Install aur packages ?"; then
	yay --needed --ask 4 -Sy - <./packages-aur
fi

if ask "Install configs ?"; then
	# Load configs
	stow */

	# Load cron jobs
	crontab ".crontab"

	# Change shell to ZSH
	chsh -s "$(which zsh)"

	# Add user groups
	sudo gpasswd -a "$USER" input

	# Setup gnome keyring
	echo "auth optional pam_gnome_keyring.so" | sudo tee -a /etc/pam.d/login
	echo "session optional pam_gnome_keyring.so auto_start" | sudo tee -a /etc/pam.d/login
	echo "password optional pam_gnome_keyring.so" | sudo tee -a /etc/pam.d/passwd

	# Setup services
	sudo systemctl enable --now auto-cpufreq
	sudo systemctl enable --now autorandr
	sudo systemctl enable --now bluetooth
	sudo systemctl enable --now cronie
	sudo systemctl enable --now reflector.timer

	# Setup emacs
	~/.emacs.d/bin/doom install

	# Enable dark mode for gnome apps
	gsettings set org.gnome.desktop.interface color-scheme prefer-dark
fi

if ask "Install graphics controller ?"; then
	vga_controller=$(lspci | grep -i --color 'vga\|3d\|2d')
	if [ -n "$(echo "$vga_controller" | grep -q "Intel")" ]; then
		sudo pacman -S intel-media-driver vulkan-intel libvdpau-va-gl
		echo "VDPAU_DRIVER=va_gl" | sudo tee -a /etc/environment
		echo "LIBVA_DRIVER_NAME=iHD" | sudo tee -a /etc/environment
	fi

fi
