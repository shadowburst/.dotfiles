{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-mcp-adapter";
  version = "2.33.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-mcp-adapter";
    rev = "v2.33.0";
    hash = "sha256-6p0uDmtGse+vIH0yiYKBSpQQG0eiWcj9Q+uDcRs/Ulg=";
  };

  npmDepsHash = "sha256-tS5bJqUGvExvPPLsDMfs1WF11ijyEkOfPgSQeV7Fw1A=";
  npmDepsFetcherVersion = 2;

  postPatch = ''
    ${pkgs.jq}/bin/jq 'del(.devDependencies)' package.json > package.json.tmp
    mv package.json.tmp package.json
    ${pkgs.jq}/bin/jq '
      del(.packages[""].devDependencies)
      | .packages |= with_entries(select(.value.dev != true))
      | .packages["node_modules/@modelcontextprotocol/client"].dependencies["@modelcontextprotocol/core"] = "https://pkg.pr.new/@modelcontextprotocol/core@3b205e7dd2f997b6a87e479e36421f7eaa2058e0"
    ' package-lock.json > package-lock.json.tmp
    mv package-lock.json.tmp package-lock.json
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