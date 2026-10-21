# nas

AMD Lenovo laptop, core + CLI + Home Manager only; no GUI, gaming, or work scope.
Native Nextcloud, Immich, Jellyfin, and Transmission. Application data is on the
internal OS disk under `/srv`; there is no separate data mount or SMB/NFS share.

Feature configuration lives in flat `modules/` files (Nextcloud, Immich,
Jellyfin, PostgreSQL, media storage, and secrets), with Transmission's server
configuration alongside its existing GUI configuration. They contribute to the
`nas` scope, like other host-scoped features. `hosts/nas/` only composes scopes
and supplies host/hardware settings.

## First deployment

1. Install NixOS and create your existing `pbaudry` user, then clone this repository.
   The flake preserves the existing user's password. Enable flakes if necessary.

2. Generate the real hardware configuration:

   ```sh
   sudo nixos-generate-config --show-hardware-config > /tmp/nas-hardware.nix
   ```

   In `hardware-configuration.nix`, keep the outer `flake.nixosModules.nas`
   wrapper, but replace its NixOS module function with the generated function,
   including its arguments, imports, filesystems, initrd/LUKS settings, and swap.
   The placeholder intentionally has no root filesystem and cannot be deployed.
   This host assumes UEFI + GRUB; adjust `configuration.nix` for legacy BIOS.

3. Create the runtime secrets directory:

   ```sh
   sudo install -d -m 0700 -o root -g root /etc/nas
   ```

   Create `/etc/nas/transmission.json` with `sudoedit`:

   ```json
   { "rpc-password": "YOUR-DIFFERENT-STRONG-PASSWORD" }
   ```

   ```sh
   sudo chown root:root /etc/nas/transmission.json
   sudo chmod 0600 /etc/nas/transmission.json
   ```

   Keep this file outside this repository. Do not overwrite existing
   credentials when repeating deployment.

4. Include the new files in Git, then apply on the laptop:

   ```sh
   sudo nixos-rebuild switch --flake .#nas
   sudo tailscale up
   sudo tailscale set --ssh --operator=pbaudry
   ```

   Enable MagicDNS in your tailnet. No Tailscale auth key is committed; the login
   persists across reboots. Transmission requires its JSON password file.

5. On a fresh installation, create the Nextcloud administrator after setup:

   ```sh
   sudo nextcloud-occ user:add pbaudry
   sudo nextcloud-occ group:adduser admin pbaudry
   ```

   The first command prompts for a password. Skip this step if the account
   already exists; existing users and passwords are preserved. The old
   `/etc/nas/nextcloud-admin-password` file is no longer used.

## Access

From a device on the same tailnet:

| Application | URL |
| --- | --- |
| Nextcloud / WebDAV | http://nas |
| Immich | http://nas:2283 |
| Jellyfin | http://nas:8096 |
| Transmission | http://nas:9091/transmission/web/ |

These are HTTP **inside Tailscale's encrypted tunnel**, not public HTTPS.
The node's full `nas.<tailnet>.ts.net` name also works. Do not forward these ports
on your router. Application TCP ports are allowed only on `tailscale0`; SSH
follows the existing Tailscale configuration. Restrict tailnet ACLs to intended
users. Register the initial Immich and Jellyfin administrator accounts before
giving anyone else access. Transmission uses username `pbaudry` and its JSON
password. Nextcloud handles file sync/sharing/WebDAV; no extra NAS share is needed.

Transmission uses the host's ordinary routing and DNS. No ProtonVPN setup,
per-application tunnel, or kill switch is configured. Tailscale protects access
to the web UI; it does not hide torrent traffic from your ISP. Any system-wide
VPN must be configured separately.

## Storage and GPU

- `/srv/nextcloud`: Nextcloud configuration and user files.
- `/srv/immich`: Immich photos/videos, owned privately by `immich`.
- `/srv/jellyfin`: Jellyfin configuration and metadata.
- `/srv/postgresql/17`: Nextcloud and Immich databases.
- `/srv/transmission`: torrent metadata/resume state.
- `/srv/media/{downloads,incomplete,movies,tv}`: shared `media` group; `pbaudry`
  can manage it, Transmission writes downloads, Jellyfin gets read-only access.

Add `/srv/media/movies`, `/srv/media/tv`, or `/srv/media/downloads` as Jellyfin
libraries. Use Transmission's move-data action to organize torrents while
preserving seeding. Nextcloud/Immich managed files are deliberately not shared
with the torrent client; do not point either app at the other's managed storage.

VA-API is enabled for both media services, using `/dev/dri/renderD128`.
Check that device on the laptop and adjust `modules/immich.nix` and
`modules/jellyfin.nix` if needed.
Jellyfin starts with H.264 hardware decode/encode only; enable other supported
codecs in its dashboard after checking the exact GPU. Its dashboard settings
persist. Immich machine learning stays on CPU. Lid closure and idle time do not
suspend the server, including on battery—shut down before transporting it.

## Diagnostics and recovery

On the NAS:

```sh
systemctl status nextcloud-setup immich-server jellyfin transmission
```

**Backups are deferred, not provided.** Before trusting this with irreplaceable
files, back up `/srv` with consistent PostgreSQL dumps (both databases), plus
`/etc/nas` and the host configuration to a different disk or remote destination.
Stop application writes while capturing a consistent backup; copying a running
PostgreSQL data directory is not sufficient. Tailnet identity also lives in
`/var/lib/tailscale`; Redis and ML/transcode caches are disposable. Test restoring
the databases and managed files together. The internal disk is a single point
of failure; monitor its free space so torrents cannot fill the database volume.
