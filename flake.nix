{
  description = "Flake to work with homelab setup";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }: flake-utils.lib.eachDefaultSystem (system:
    let
      lib = nixpkgs.lib;

      # Import nixpkgs to access packages
      pkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfreePredicate = pkg: builtins.elem (lib.getName pkg) [
            "terraform"
          ];
        };
      };
    in {
      # Define the devShell for the current system
      devShell = pkgs.mkShell {
        buildInputs = with pkgs; [
          kubernetes-helm
          kubectl
          nil
          terraform
          tflint
          typescript-language-server

          # Adding node for copilot
          nodejs_24

          # cli tools
          nodePackages.cdktf-cli
        ];

        shellHook = ''
          # Install the barman cloud plugin
          kubectl create namespace cnpg-system
          kubectl apply -f https://github.com/cloudnative-pg/plugin-barman-cloud/releases/download/v0.5.0/manifest.yaml
        '';
      };
    }
  );
}
