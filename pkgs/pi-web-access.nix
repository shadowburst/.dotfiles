{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-web-access";
  version = "0.36.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "v0.36.0";
    hash = "sha256-vXdaYGy7GLs1Yg5TXRoO4QFtkN2LR02nDqSnRyqftnM=";
  };

  npmDepsHash = "sha256-ss5hKx2U7fRFfGm39u2jOmIW670u1tSR398fbJXyg7U=";

  postPatch = ''
    ${pkgs.nodejs}/bin/npm pkg delete devDependencies
    ${pkgs.nodejs}/bin/npm install --package-lock-only --ignore-scripts --legacy-peer-deps
  '';

  npmInstallFlags = [
    "--omit=dev"
    "--legacy-peer-deps"
  ];
  dontNpmBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r ./* $out/
    runHook postInstall
  '';
}