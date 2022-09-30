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

sudo pacman-mirrors -f
sudo pacman -Syyu

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
	sudo crontab ".crontab"

	# Setup gnome keyring
	sudo echo "auth optional pam_gnome_keyring.so" >>/etc/pam.d/login
	sudo echo "session optional pam_gnome_keyring.so auto_start" >>/etc/pam.d/login
	sudo echo "password optional pam_gnome_keyring.so" >>/etc/pam.d/passwd

	# Setup auto-cpufreq
	sudo systemctl enable --now auto-cpufreq

	# Setup emacs
	~/.emacs.d/bin/doom install
fi
