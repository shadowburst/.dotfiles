{ lib, pkgs }:
(pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_22; }) (finalAttrs: {
  pname = "clickup-cli";
  version = "1.43.0";

  src = pkgs.fetchFromGitHub {
    owner = "krodak";
    repo = "clickup-cli";
    rev = "v${finalAttrs.version}";
    hash = "sha256-io/KZnyt719w1S775d7ig2lJKqS/hElbzYgOqVXkx7k=";
  };

  npmDepsHash = "sha256-KWWUrgvtziv5OpLuaXLGoE+Dvdtt5SJSg8c2W6nUuB8=";

  nativeBuildInputs = [ pkgs.makeWrapper ];
  npmBuildScript = "build";

  postInstall = ''
    wrapProgram $out/bin/cup --prefix PATH : ${lib.makeBinPath [ pkgs.nodejs_22 ]}
  '';

  meta = {
    description = "ClickUp CLI for AI agents and humans";
    homepage = "https://github.com/krodak/clickup-cli";
    license = lib.licenses.mit;
    mainProgram = "cup";
  };
})
