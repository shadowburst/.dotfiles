#!/usr/bin/env bash

# This script installs and sets up all the packages that I use
# Currently this script is only configured for Arch, BTW

# Stop script if any errors are encountered
set -e

automatic=false

ask()
{
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

	# Install zgenom to manage zsh plugins
	git clone https://github.com/jandamm/zgenom.git "${HOME}/.zgenom"

	# Load cron jobs
	crontab "$HOME/.crontab"

	# Setup gnome keyring
	echo "auth optional pam_gnome_keyring.so" >>/etc/pam.d/login
	echo "session optional pam_gnome_keyring.so auto_start" >>/etc/pam.d/login
	echo "password optional pam_gnome_keyring.so" >>/etc/pam.d/passwd

	# Setup auto-cpufreq
	sudo systemctl enable --now auto-cpufreq

	# Setup ranger
	mkdir -p "$HOME/.config/ranger/plugins"
	git clone https://github.com/maximtrp/ranger-archives.git "$HOME/.config/ranger/plugins/ranger-archives"
	git clone https://github.com/alexanderjeurissen/ranger_devicons "$HOME/.config/ranger/plugins/ranger_devicons"

	# Setup lightdm
	sudo systemctl enable lightdm
	sudo cp "$HOME/.wallpapers/current.jpg" /usr/share/backgrounds/
fi
